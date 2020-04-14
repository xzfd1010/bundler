const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const babel = require('@babel/core')

// 对入口文件进行分析
const moduleAnalyser = (filename) => {
  const content = fs.readFileSync(filename, 'utf-8')

  // 获取AST  babel/parser
  const ast = parser.parse(content, {
    sourceType: 'module'
  })
  // 根据import声明，寻找依赖关系 babel/traverse
  const dependencies = {} // 储存import的文件路径
  traverse(ast, {
    ImportDeclaration ({ node }) {
      const dirname = path.dirname(filename)
      const newFile = './' + path.join(dirname, node.source.value)
      // 以这种形式分析打包路径最方便
      dependencies[node.source.value] = newFile
    }
  })
  // 将AST转为可运行的代码
  const { code } = babel.transformFromAst(ast, null, {
    presets: ['@babel/preset-env']
  })
  return {
    filename,
    dependencies,
    code
  }
}

// 分析依赖图谱
const makeDependenciesGraph = (entry) => {
  const entryModule = moduleAnalyser(entry)
  const graphArray = [entryModule]
  for (let i = 0; i < graphArray.length; i++) {
    const item = graphArray[i]
    const { dependencies } = item
    if (dependencies) {
      for (let j in dependencies) {
        graphArray.push(
          moduleAnalyser(dependencies[j])
        )
      }
    }
  }
  // 将filename作为key，dependencies 和 code作为值，拼装对象
  const graph = {}
  graphArray.forEach(({ filename, dependencies, code }) => {
    graph[filename] = {
      dependencies,
      code
    }
  })
  return graph
}

// 生成可执行代码
const generateCode = (entry) => {
  const graph = JSON.stringify(makeDependenciesGraph(entry))
  // 返回函数体，是IIFE的形式，传入的参数是格式化的graph
  // 函数体中需要require函数和exports对象
  return `
    (function(graph){
      function require(module) { 
        // 为了处理路径问题，利用映射关系，从相对路径拿到真实的文件路径
        // 包装了一层require
        function localRequire(relativePath){
          return require(graph[module].dependencies[relativePath])
        }
        var exports = {}; // 空对象，在下面的立即执行函数中执行
        // 执行代码 
        (function(require,exports,code){
          eval(code)
        })(localRequire,exports,graph[module].code)
        
        return exports;
      };
      require('${entry}') 
    })(${graph});
  `
}

const code = generateCode('./src/index.js')
console.log(code)
