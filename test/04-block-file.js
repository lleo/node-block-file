/* global describe it */

var Handle = require('../lib/handle')
  , BlockFile = require('../lib/block_file')
  , BLOCK_SIZE = BlockFile.BLOCK_SIZE
  , utils = require('../lib/utils')
  , fs = require('fs')
  , u = require('lodash')
  , async = require('async')
  , assert = require('assert')
  , expect = require('chai').expect
  , log = console.log
  , format = require('util').format
  , sprintf = require('printf')
  , printf = require('../lib/utils').printf
  , eprintf = require('../lib/utils').eprintf

var filename ='test.bf'
  , err, stat

try {
  stat = fs.statSync(filename)
}
catch (x) {
  err = x
}

if (stat) {
  fs.unlinkSync(filename)
}

describe("BlockFile", function(){
  var blks = []
    , STR = "This is the end, the only end, my friend."

  describe("BlockFile.create()", function(){
    var bf

    it("should create a file "+filename, function(done){
      BlockFile.create(filename, function(err, bf_){
        bf = bf_
        if (err) {
          done(err)
          return
        }
        expect(bf).to.be.an.instanceof(BlockFile)
        //expect(bf instanceof BlockFile).to.be.true
        done()
      })
    })


    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("BlockFile.open() & write one", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        bf = bf_
        if (err) {
          done(err)
          return
        }
        expect(bf).to.be.an.instanceof(BlockFile)
        //expect(bf instanceof BlockFile).to.be.true
        done()
      })
    })


    it("should write a simple buffer to file", function(done){

      blks[0] = { /* buf: Buffer, sz: num */ }
      blks[0].str = STR
      blks[0].sz  = Buffer.byteLength(blks[0].str, 'utf8')
      blks[0].buf = new Buffer(2+blks[0].sz)
      blks[0].buf.writeUInt16BE(blks[0].sz, 0)
      blks[0].buf.write(blks[0].str, 2, 'utf8')

      bf.write(blks[0].buf, function(err, hdl) {
        if (err) {
          done(err)
          return
        }

        blks[0].hdl = hdl;
        done()
      })
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("BlockFile.open() & read one", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        bf = bf_
        if (err) {
          done(err)
          return
        }
        expect(bf).to.be.an.instanceof(BlockFile)
        done()
      })
    })


    it("should read the previous simple buffer from file", function(done){
      bf.read(blks[0].hdl, function(err, buf, hdl){
        if (err) { done(err); return; }
        var sz, str

        sz = buf.readUInt16BE(0)
        //bf.log("sz = %d", sz)
        //bf.log("blks[%d].sz = %d", 0, blks[0].sz)
        expect(sz).to.equal(blks[0].sz)

        str = buf.toString('utf8', 2, 2+sz)
        //bf.log("str=>%s<", str)
        //bf.log("blks[%d].str=>%s<", 0, blks[0].str)
        expect(str).to.equal(blks[0].str)

        done()
      })
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })

  describe("BlockFile.open() & write 32750 (MAX_BLKNUM-1)", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        bf = bf_
        if (err) {
          done(err)
          return
        }
        expect(bf).to.be.an.instanceof(BlockFile)
        //expect(bf instanceof BlockFile).to.be.true
        done()
      })
    })


    it("should write a simple buffer to file 32750 (MAX_BLKNUM-1) times"
      , function(done){
          var i=1
          async.whilst(
            /*test*/
            function() { return i < Handle.MAX_BLOCKNUM }
            /*body*/
          , function(loop){
              blks[i] = { /* str: STR, sz: num, buf: Buffer, hdl: Handle */ }
              blks[i].str = STR
              blks[i].sz  = Buffer.byteLength(blks[i].str, 'utf8')
              blks[i].buf = new Buffer(2+blks[i].sz)
              blks[i].buf.writeUInt16BE(blks[i].sz, 0)
              blks[i].buf.write(blks[i].str, 2, 'utf8')

              bf.write(blks[i].buf, function(err, hdl) {
                if (err) {
                  loop(err)
                  return
                }

                blks[i].hdl = hdl;

                i += 1
                loop()
             })
            }
            /*results*/
          , function(err){
              done(err)
            }
          )
        })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("BlockFile.open() & read 32751 (MAX_BLKNUM)", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename, function(err, bf_){
        bf = bf_
        if (err) {
          done(err)
          return
        }
        expect(bf).to.be.an.instanceof(BlockFile)
        done()
      })
    })


    it("should read the previous simple buffer from file 32750 (MAX_BLKNUM-1) times"
      , function(done){
          var i=0
          async.whilst(
            /*test*/
            function() { return i < Handle.MAX_BLOCKNUM }
            /*body*/
          , function(loop){
              bf.read(blks[i].hdl, function(err, buf, hdl){
                if (err) { done(err); return; }
                var sz, str

                sz = buf.readUInt16BE(0)
                //bf.log("sz = %d", sz)
                //bf.log("blks[%d].sz = %d", i, blks[i].sz)
                expect(sz).to.equal(blks[0].sz)

                str = buf.toString('utf8', 2, 2+sz)
                //bf.log("str=>%s<", str)
                //bf.log("blks[%d].str=>%s<", i, blks[i].str)
                expect(str).to.equal(blks[i].str)

                i += 1
                loop()
              })
            }
            /*results*/
          , function(err){
              done(err)
            }
          )
        })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })

  //describe("BlockFile.open()", function(){
  //  it("", function(){})
  //})
})