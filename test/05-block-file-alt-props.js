/* global describe it */

var Handle = require('../lib/handle')
  , BlockFile = require('../lib/block_file')
  , Props = require('../lib/props')
  , utils = require('../lib/utils')
  , fs = require('fs')
  , async = require('async')
  , Y = require('ya-promise')
  , assert = require('assert')
  , expect = require('chai').expect
  , util = require('util')
  , format = util.format
  , inspect = util.inspect
  , u = require('lodash')
  , ceil = Math.ceil
  , floor = Math.floor
var filename ='test-alt.bf'
  , fnStat
  , lorem1k_fn = 'test/lorem-ipsum.1k.txt'
  , lorem1kStr
  , lorem1kSiz
  , lorem1kBuf
  , lorem4k_fn = 'test/lorem-ipsum.4k.txt'
  , lorem4kStr
  , lorem4kSiz
  , lorem4kBuf
  , lorem64k_fn = 'test/lorem-ipsum.64k.txt'
  , lorem64kStr
  , lorem64kSiz
  , lorem64kBuf
  , lorem256kStr
  , lorem256kSiz
  , lorem256kBuf
  , outputFN = "stats-alt.txt"

try {
  fnStat = fs.statSync(filename)
} catch (x) {
  console.warn(x)
}

if (fnStat) {
  fs.unlinkSync(filename)
}

lorem1kStr  = fs.readFileSync(lorem1k_fn, 'utf8')
lorem1kSiz = Buffer.byteLength( lorem1kStr, 'utf8' )
lorem1kBuf = new Buffer( 4 + lorem1kSiz )
lorem1kBuf.writeUInt32BE( lorem1kSiz, 0 )
lorem1kBuf.write( lorem1kStr, 4, lorem1kSiz, 'utf8' )
assert.ok(lorem1kBuf.length <= 1024)
assert.ok(lorem1kBuf.length > 768)

lorem4kStr  = fs.readFileSync(lorem4k_fn, 'utf8')
lorem4kSiz = Buffer.byteLength( lorem4kStr, 'utf8' )
lorem4kBuf = new Buffer( 4 + lorem4kSiz )
lorem4kBuf.writeUInt32BE( lorem4kSiz, 0 )
lorem4kBuf.write( lorem4kStr, 4, lorem4kSiz, 'utf8' )
assert.ok(lorem4kBuf.length <= 4*1024) //lorem4kStr.length < 4*1024-4
assert.ok(lorem4kBuf.length > 3*1024)

lorem64kStr  = fs.readFileSync(lorem64k_fn, 'utf8')
lorem64kSiz = Buffer.byteLength( lorem64kStr, 'utf8' )
lorem64kBuf = new Buffer( 4 + lorem64kSiz )
lorem64kBuf.writeUInt32BE( lorem64kSiz, 0 )
lorem64kBuf.write( lorem64kStr, 4, lorem64kSiz, 'utf8' )
assert.ok(lorem64kBuf.length <= 64*1024) //lorem64kStr.length < 64*1024-4
assert.ok(lorem64kBuf.length > 63*1024)

lorem256kStr = utils.repeatStr(lorem64kStr+"\n", 4)
lorem256kSiz = Buffer.byteLength( lorem256kStr, 'utf8' )
lorem256kBuf = new Buffer( 4 + lorem256kSiz )
lorem256kBuf.writeUInt32BE( lorem256kSiz, 0 )
lorem256kBuf.write( lorem256kStr, 4, lorem256kSiz, 'utf8' )
assert.ok(lorem256kBuf.length <= 256*1024) //lorem256kStr.length < 256*1024-4
assert.ok(lorem256kBuf.length > 255*1024) //lorem256kStr.length < 256*1024-4


describe("BlockFile w/alternative metaProps", function(){
var metaProps = { numHandleBits: 64
                , fsmSzBits    : 13 //8192
                , blockSzBits  : 10 //1024
                , checkSumBits : 32
                , spanNumBits  : 8
                }
  , props = new Props(metaProps)
  //, NUM_SPANNUM
  //, NUM_BLOCKNUM
  , blks = [], nextIdx, lastIdx
  , lastHdl

  //for (var p in props)
  //  if (u.has(props, p) && p[0] != '_' && typeof props[p] == 'number')
  //    utils.err("props.%s = %d", p, props[p])

  describe("Create BlockFile", function(){
    it("reset BlockFile.STATS", function(done){
      BlockFile.STATS.reset()
      //utils.err("\nsegNumBits  = %j", props.segNumBits)
      //utils.err("blkNumBits  = %j", props.blkNumBits)
      //utils.err("spanNumBits = %j", props.spanNumBits)
      //utils.err("lorem256kSiz = %j", lorem256kSiz)

      done()
    })


    it("BlockFile.create(), "+filename, function(done){
      BlockFile.create(filename, metaProps, done)
    })

  })

  describe("Open BlockFile", function(){
    var bf
    it("BlockFile.open(), "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        if (err) { done(err); return }
        bf = bf_
        done()
      })
    })

    it("bf.close()", function(done){
      bf.close(done)
    })
  })

  describe("Write 1 segment worth of 1k buffers", function(){
    var bf
    it("BlockFile.open(), "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        if (err) { done(err); return }
        bf = bf_
        done()
      })
    })

    it("Write bf.props.numBlkNums() lorem1k buffers", function(done){
      this.timeout(20*1000)
      lastIdx = 0
      nextIdx = lastIdx + (bf.props.numBlkNums()-1)

      //utils.err("numBlkNums-1 = %j", bf.props.numBlkNums()-1)

      var i = lastIdx
      async.whilst(
        /*test*/
        function() { return i < nextIdx }
        /*body*/
      , function(loop){
          blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
          blks[i].str = lorem1kStr
          blks[i].siz = lorem1kSiz

          bf.store(lorem1kBuf, function(err, hdl){
            if (err) { loop(err); return }
            //utils.err("blks[%d] = %s", i, hdl)
            lastHdl = hdl
            blks[i].hdl = hdl;
            i += 1
            loop()
          })
        }
        /*results*/
      , function(err){ done(err) } )

    }) //it("Write bf.props.numBlkNums() lorem1k buffers",

    it("should only have one segemnt", function(){
      //utils.err("lastHdl = %s", lastHdl)
      expect(bf.segments.length).to.equal(1)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  }) //describe("Write 1 segment worth of 1k buffers",

  describe("Write 1 segment worth of 64k buffers", function(){
    var bf
    it("BlockFile.open(), "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        if (err) { done(err); return }
        bf = bf_
        done()
      })
    })

    it("Write bf.props.numBlkNums()/64 lorem1k buffers", function(done){
      this.timeout(2*1000)
      lastIdx = nextIdx
      nextIdx += ceil(bf.props.numBlkNums()/64) - 1

      //utils.err("ceil(numBlkNums/64-1 = %j)", ceil(bf.props.numBlkNums()/64)-1)
      var i = lastIdx
      async.whilst(
        /*test*/
        function() { return i < nextIdx }
        /*body*/
      , function(loop){
          blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
          blks[i].str = lorem64kStr
          blks[i].siz = lorem64kSiz

          bf.store(lorem64kBuf, function(err, hdl) {
            if (err) { loop(err); return }
            //utils.err("blks[%d] = %s", i, hdl)
            blks[i].hdl = hdl;
            i += 1
            loop()
          })
        }
        /*results*/
      , function(err){ done(err) } )

    }) //it("Write bf.props.numBlkNums()/64 lorem1k buffers",

    it("should have two segemnts", function(){
      expect(bf.segments.length).to.equal(2)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  }) //describe("Write 1 segment worth of 64k buffers",

  describe("Write one more 64k block to roll #segments over to 3", function(){
    var bf
    it("BlockFile.open(), "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        if (err) { done(err); return }
        bf = bf_
        done()
      })
    })

    it("should write one 64k block", function(done){
      lastIdx = nextIdx
      nextIdx += 1

      var i = lastIdx
      blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
      blks[i].str = lorem64kStr
      blks[i].siz = lorem64kSiz

      bf.store(lorem64kBuf, function(err, hdl){
        if (err) { done(err); return }
        //utils.err("blks[%d] = %s", i, hdl)
        blks[i].hdl = hdl;
        done()
      })
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

    it("should now have three segemnts", function(){
      expect(bf.segments.length).to.equal(3)
    })
  })

  describe("Read all entries & compare to in memory list", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        if (err) { done(err); return }
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      })
    })


    it("Read all blks.length blks[i].hdl", function(done){
      this.timeout(10*1000)

      for (var j=0; j<blks.length; j+=1) {
        assert(typeof blks[j] != 'undefined', format("blks[%d] is undefined", j))
      }

      //utils.err("blks.length = %j", blks.length)

      var i = 0
      async.whilst(
        /*test*/
        function() { return i < blks.length }
        /*body*/
      , function(loop){
          bf.load(blks[i].hdl, function(err, buf, hdl){
            if (err) { loop(err); return }

            var siz, str

            siz = buf.readUInt32BE(0)
            expect(siz).to.equal(blks[i].siz)

            str = buf.toString('utf8', 4, 4+siz)
            expect(str).to.equal(blks[i].str)

            i += 1
            loop()
          })
        }
        /*results*/
      , function(err){ done(err) })

    }) //it("Read all blks.length blks[i].hdl"

    it("bf.close()", function(done){
      bf.close(done)
    })

  })

  describe("Write the stats out to "+outputFN, function(){
    it("should dump BlockFile.STATS", function(done){
      fs.writeFile(outputFN, BlockFile.STATS.toString({values:"both"})+"\n"
                  , function(err){ done(err) })
    })
  })

}) //describe("BlockFile w/alternative metaProps",