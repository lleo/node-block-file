
var fs = require('fs')
  , Y = require('ya-promise')

exports.open  = Y.promisify(fs.open, fs)
exports.close = Y.promisify(fs.close, fs)
exports.read  = Y.promisify(fs.read, fs)
exports.write = Y.promisify(fs.write, fs)
exports.stat  = Y.promisify(fs.stat, fs)
