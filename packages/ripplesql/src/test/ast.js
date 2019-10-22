const { Parser } = require('node-sql-parser')

const parser = new Parser()

const ast = parser.astify(/*sql*/ `UPDATE tbl_AlphaBetaOmega abo
LEFT JOIN tbl_TreeBark tb ON abo.id = tb.id  SET abo.xxx = "yyyy"
WHERE cm.secondaryID in (1, 2, 3, 4, 5) AND cmi.otherRow = "whatever";`)

console.log(JSON.stringify(ast, null, 2))
