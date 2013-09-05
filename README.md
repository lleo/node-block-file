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

### Blockfile.open(filename, [props], cb)`

Where `cb` has the signature `cb(err, bf)`. and `bf` is the block-file obect.

```javascript
BlockFile.open(filename, function(err, bf){
  ...
})
```

### `bf.close(cb)`

Where `cb` has the signature `cb(err)`.

```javascript
BlockFile.open(filename, function(err, bf){
  if (err) throw err
  return bf.close(function(err){
    if (err) throw err
    console.log("%s closed", filename)
  })
})
```

### `bf.store(buffer, [handle], cb)`

Where `cb` has the signature `cb(err, handle)`. If node `handle` is provided
as an argument to `bf.store()` then a new `handle` is allocated. The callback
contains to `handle` of where the `buffer` was stored.

```javascript
bf.store(buffer, function(err, handle){
  ...
})
```

```javascript
bf.store(buffer, handle, function(err, handle){
  ...
})
```

### `bf.load(handle, cb)`

```javascript
bf.load(handle, function(err, buffer, handle){
  ...
})
```

### `handle = bf.reserve(numBlocks, cb)`

Where `cb` has the signature `cb(err)`.

### `boolean = bf.release(handle, cb)`

Where `cb` has the signature `cb(err)`.

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

I am thinking of not having a 64bit handle option. :) solved that problem...

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
* 5 => 1, 2, 3, ..., or 32 blocks (you get the picture)

#### checkSumBits
default: `16`

supported: `16` and `32` CRCs

#### checkSumOffset
default: `0`

Really never used. Don't touch!

# Basic Use

```javascript
var BlockFile = require('block-file')
  , hdls
  , str = "lorem ipsum ..."

BlockFile.open("my-data.bf", function(err, bf){
  if (err) throw err
  var strLen = Buffer.byteLength(str)
    , buf = new Buffer(strLen+2)
    , promises = []

  buf.writeUInt16BE(strLen, 0)
  buf.write(str, 2, strLen)

  async.eachSeries(
    [ buf, buf ]
  , function(b, next){ bf.store(b, next) }
  , function(err, res){
      if (err) throw err
      hdls = res
      bf.close(function(err){
        if (err) throw err
        var a = hdls.map(function(hdl){ return hdl.toString() })
        console.log(a)
        fs.writeFileSync("handles.json", JSON.stringify(a))
      })
  })
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

