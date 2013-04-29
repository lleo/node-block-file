# Block File Libary

## Purpose

A library to allocate, free, read, and write fixed size blocks in a file.
Blocks are addressed by 32bit or 64bit "handles". The blocks can be any
power of 2 size, but is fixed when you create a BlockFile.

Handles can indicate a contiguous set of blocks. Again, how many blocks
exist it a span is a power of 2 number.

All the async functions return promises from the `ya-promise` npm module (a
Promise/A+ library).

## Basic Use

```javascript
var Y = require('ya-promise')
  , BlockFile = require('block-file')
  , hdls
  , str = "lorem ipsum ..."

BlockFile.create("my-data.bf")
.then(function(bf){
  var buf = new Buffer(str)
    , promises = []

  promises[0] = bf.store(buf)
  promises[1] = bf.store(buf)

  Y.all(promises).then(function(v){ hdls = v })

  return bf.close()
})
.then(function(){
  fs.writeFileSync("handles.json", JSON.strinigify(hdls))
})
```

```javascript
var BlockFile = require('block-file')
  , hdls = JSON.parse( fs.readFileSync("handles.json") )

BlockFile.open("my-data.bf")
.then(function(bf){


})

```