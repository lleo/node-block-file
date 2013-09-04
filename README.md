# Block File Libary

# Purpose

A library to allocate, free, read, and write fixed size blocks in a file.
Blocks are addressed by 32bit or 64bit "handles". The blocks can be any
power of 2 size, but is fixed when you create a BlockFile.

Handles can indicate a contiguous set of blocks. Again, how many blocks
exist it a span is a power of 2 number.

All the async functions return promises from the `ya-promise` npm module (a
Promise/A+ library).

# API

# BlockFile

### `promise = Blockfile.open(filename, [props])`

```javascript
BlockFile.open(filename)
.then(function(bf){
  ...
})
```

### `promise = bf.close()`

```javascript
BlockFile.open(filename)
.then(function(bf){
   return bf.close()
})
.then(function(){
   console.log("%s closed", filename)
})
```

### `promise = bf.store(buffer, [handle])`

```javascript
bf.store(buffer)
.then(function(handle){
  ...
})
```

```javascript
bf.store(buffer, handle)
.then(function(handle){
  ...
})
```

### `promise = bf.load(handle)

```javascript
bf.load(handle)
.spread(function(buffer, handle){
  ...
})
```

### `handle = bf.reserve(numBlocks)`

### `boolean = bf.release(handle)`

`boolean` reflects whether the handle was reserved already or not.


## Props

The parameters varying the size of segment numbers, block number, span numbers,
sizes of the Free Space Maps, etcetra.

### MetaProps

#### numHandleBits
default: `32`

I haven't figured out how to get 64 to be encoded yet. Just stick with `32` ok.

Number of bit a handle value is contained as: `32` or `64`. Only encoding
into a 32bit value is supported with `32`. While `64` can not currently be
encoded into a 64bit value, ALL other constraints relating to bit lengths are
supported.

#### blockSzBits
default: `12`

4k blocks are default. `pow(2,12) == 4096`

#### fsmSzBits
default: blockSzBits

number of blocks per segment minus a checksum. Basically the free space map
is a bit field `pow(fsmSzBits)` bytes long. However for safety we checksum the
bit field. That checksum (either 16 or 32 bits consumes 2 or 4 bytes of the
bit field. So the number of blocks in a segment is the same as the number of
bits in the Free Space Map minus the checksum bits.

If you make your blockSzBits smaller, feel free to keep the fsmSzBits large
by explicitly setting the value.

#### spanNumBits
default: `4`

original block + spanNumBits as an unsigned integer blocks

* 0 => no span blocks (just the original block)
* 1 => 1 or 2 blocks (aka original block + one more)
* 2 => 1, 2, 3, or 4 blocks
* 3 => 1, 2, 3, 4, 5, 6, 7, or 8 blocks
* 4 => 1, 2, 3, ..., or 16 blocks
* 5 (are you getting the pattern yet?)


#### checkSumBits
default: `16`

supported: `16` and `32` CRCs

#### checkSumOffset
default: `0`

Really never used. Don't touch!

# Basic Use

```javascript
var Y = require('ya-promise')
  , BlockFile = require('block-file')
  , hdls
  , str = "lorem ipsum ..."

BlockFile.open("my-data.bf")
.then(
  function(bf){
    var strLen = Buffer.byteLength(str)
      , buf = new Buffer(strLen+2)
      , promises = []

    buf.writeUInt16BE(strLen, 0)
    buf.write(str, 2, strLen)
    
    promises[0] = bf.store(buf)
    promises[1] = bf.store(buf)
    
    return Y.all(promises)
           .then(function(v){ hdls = v })
           .then(function(){ return bf.close() })
})
.then(
  function(){
    var a = hdls.map(function(v){ return v.toString() })
    console.log(a)
    fs.writeFileSync("handles.json", JSON.stringify(a))
})
.done()
```

```javascript
var fs = require('fs')
  , BlockFile = require('block-file')
  , Handle = require('./lib/handle')
  , hdls = []

var data = JSON.parse( fs.readFileSync("handles.json") )

data.forEach(function(hdlStr,i){
  var hdl = Handle.fromString( hdlStr )
  hdls.push(hdl)
})

BlockFile.open("my-data.bf")
.then(function(bf){
  var promises = []

  hdls.forEach(function(hdl,i){
    promises[i] = bf.load(hdl)
  })

  return Y.all(promises)
         .then(function(rets){
           rets.forEach(function(ret, i){
             var buf = ret[0]
               , hdl = ret[1]
               , len = buf.readUInt16BE(0)
               , str = buf.toString('utf8', 2, len+2)

             console.log("content = %j", str)
           })
         })
})
.done()
```

