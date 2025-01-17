import YAML from 'js-yaml'
import YamlLex from 'yaml'
import _ from 'lodash'
import { Parser } from './base'
import { KeyInDocument, Config } from '~/core'
import { determineYamlTabSize } from '~/utils/indent'

export class YamlParser extends Parser {
  id = 'yaml'

  constructor() {
    super(['yaml'], 'ya?ml')
  }

  async parse(text: string) {
    return YAML.load(text, Config.parserOptions?.yaml?.load) as Object
  }

  async dump(object: object, sort: boolean, compare: ((x: string, y: string) => number) | undefined, detectedIndentSize: number) {
    object = JSON.parse(JSON.stringify(object))
    const indent = this.options.useDetectIndent ? detectedIndentSize : this.options.indent
    return YAML.dump(object, {
      indent,
      sortKeys: sort ? (compare ?? true) : false,
      ...Config.parserOptions?.yaml?.dump,
    })
  }

  override detectIndentSize(text: string): number | null {
    return determineYamlTabSize(text)
  }

  annotationSupported = true
  annotationLanguageIds = ['yaml']

  parseAST(text: string) {
    const cst = YamlLex.parseCST(text)
    cst.setOrigRanges() // Workaround for CRLF eol, https://github.com/eemeli/yaml/issues/127
    const doc = new YamlLex.Document({ keepCstNodes: true }).parse(cst[0])

    const findPairs = (node: any, path: string[] = []): KeyInDocument[] => {
      if (!node)
        return []
      if (node.type === 'MAP' || node.type === 'SEQ')
      // @ts-ignore
        return _.flatMap(node.items, m => findPairs(m, path))
      if (node.type === 'PAIR' && node.value != null && node.key != null) {
        if (!['BLOCK_FOLDED', 'BLOCK_LITERAL', 'PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE'].includes(node.value.type)) {
          return findPairs(node.value, [...path, node.key.toString()])
        }
        else {
          const valueCST = node.value.cstNode
          if (!valueCST || !valueCST.valueRange)
            return []
          const { start, end, origStart, origEnd } = valueCST.valueRange
          const key = [...path, node.key.toString()].join('.')

          return [{
            start: (origStart || start) + 1,
            end: (origEnd || end) - 1,
            key,
            quoted: true,
          }]
        }
      }

      return []
    }

    return findPairs(doc.contents)
  }
}
