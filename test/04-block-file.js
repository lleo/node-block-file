/* global describe it */

var props = require('../lib/props').defaultProps
  , Handle = require('../lib/handle')
  , BlockFile = require('../lib/block_file')
  , fs = require('fs')
  , u = require('lodash')
  , async = require('async')
  , assert = require('assert')
  , expect = require('chai').expect
  , util = require('util')
  , inspect = util.inspect
  , format = util.format
  , BLOCK_SIZE = props.blockSize
  , NUM_BLOCKNUM = props.numBlkNums

var filename ='test.bf'
  , err, fnStat
  , lorem4k_fn = 'lorem-ipsum.4k.txt'
  , lorem4kStr
  , lorem4kSiz
  , lorem4kBuf
  , lorem64k_fn = 'lorem-ipsum.64k.txt'
  , lorem64kStr
  , lorem64kSiz
  , lorem64kBuf
  , sz
  , outputFN = "stats.txt"

try {
  fnStat = fs.statSync(filename)
} catch (x) {
  console.warn(x)
}

if (fnStat) {
  fs.unlinkSync(filename)
}

lorem4kStr  = fs.readFileSync(lorem4k_fn, 'utf8')
lorem4kSiz = Buffer.byteLength( lorem4kStr, 'utf8' )
lorem4kBuf = new Buffer( 2 + lorem4kSiz )
lorem4kBuf.writeUInt16BE( lorem4kSiz, 0 )
lorem4kBuf.write( lorem4kStr, 2, lorem4kSiz, 'utf8' )

lorem64kStr  = fs.readFileSync(lorem64k_fn, 'utf8')
lorem64kSiz = Buffer.byteLength( lorem64kStr, 'utf8' )
lorem64kBuf = new Buffer( 2 + lorem64kSiz )
lorem64kBuf.writeUInt16BE( lorem64kSiz, 0 )
lorem64kBuf.write( lorem64kStr, 2, lorem64kSiz, 'utf8' )


describe("BlockFile", function(){
  var blks = [], nextIdx, lastIdx

  //describe("BlockFile.create()", function(){
  describe("BlockFile.open()", function(){
    var bf

    it("should create a file "+filename, function(done){
      //BlockFile.create(filename, function(err, bf_){
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


    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Write the FIRST 4k block", function(){
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


    it("Write a 4k buffer to file", function(done){
      lastIdx = 0
      nextIdx = lastIdx + 1

      var i = lastIdx

      blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
      blks[i].str = lorem4kStr
      blks[i].siz = lorem4kSiz

      var storep = bf.store(lorem4kBuf)
      storep.then(
        function(hdl) {
          blks[i].hdl = hdl;
          done()
        }
      , function(err){ done(err) })
    })

    it("Should now have ONE segment", function(){
      expect(bf.segments.length).to.equal(1)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Read the FIRST 4k block", function(){
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


    it("Read the previous 4k buffer from file", function(done){
      var i = lastIdx
        , loadp = bf.load(blks[i].hdl)

      loadp.spread(
        function(buf, hdl){
          var siz, str

          siz = buf.readUInt16BE(0)
          expect(siz).to.equal(blks[i].siz)

          str = buf.toString('utf8', 2, 2+siz)
          expect(str).to.equal(blks[i].str)

          done()
        }
      , function(err){ done(err) })
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Fill the segment with 32751 4k (NUM_BLOCKNUM-1) more blocks", function(){
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


    it("Write a 4k buffer to file 32751 (NUM_BLKNUM-1) times"
      , function(done){
          this.timeout(5000)

          lastIdx = nextIdx
          nextIdx = lastIdx + (NUM_BLOCKNUM-1)

          var i = lastIdx

          async.whilst(
            /*test*/
            function() { return i < nextIdx }
            /*body*/
          , function(loop){
              blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
              blks[i].str = lorem4kStr
              blks[i].siz = lorem4kSiz

              var storep = bf.store(lorem4kBuf)
              storep.then(
                function(hdl) {
                  blks[i].hdl = hdl;
                  i += 1
                  loop()
                }
              , function(err) { loop(err) })
            }
            /*results*/
          , function(err){
              done(err)
            }
          )
        })

    it("Should STILL have only ONE segment", function(){
      expect(bf.segments.length).to.equal(1)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Read the whole segment of 32752 4k (NUM_BLOCKNUM) blocks", function(){
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


    it("Read 32752 (NUM_BLOCKNUM) 4k blocks"
      , function(done){
          this.timeout(10000)

          var i = nextIdx - NUM_BLOCKNUM
            , end = i + NUM_BLOCKNUM

          async.whilst(
            /*test*/
            function() { return i < end }
            /*body*/
          , function(loop){
              var loadp = bf.load(blks[i].hdl)

              loadp.spread(
                function(buf, hdl){
                  var siz, str

                  siz = buf.readUInt16BE(0)
                  expect(siz).to.equal(blks[0].siz)

                  str = buf.toString('utf8', 2, 2+siz)

                  expect(str).to.equal(blks[i].str)

                  i += 1
                  loop()
                }
              , loop)
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


  describe("Write one 4k block & make sure it adds a segment", function(){
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


    it("Write a 4k buffer to file", function(done){

      lastIdx = nextIdx
      nextIdx = lastIdx + 1

      var i = lastIdx
        , storep = bf.store(lorem4kBuf)

      blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
      blks[i].str = lorem4kStr
      blks[i].siz = lorem4kSiz

      storep.then(
        function(hdl) {
          blks[i].hdl = hdl
          done()
        }
      , function(err){ done(err) })
    })

    it("Should now have TWO segments", function(){
      expect(bf.segments.length).to.equal(2)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Fill the segment with 32751 more (NUM_BLOCKNUM-1) 4k blocks", function(){
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


    it("Write a 4k buffer to file 32751 (NUM_BLOCKNUM-1) times"
      , function(done){
          this.timeout(5000)

          lastIdx = nextIdx
          nextIdx = lastIdx + (NUM_BLOCKNUM-1)

          var i = lastIdx

          async.whilst(
            /*test*/
            function() { return i < nextIdx }
            /*body*/
          , function(loop){
              blks[i] = { str: lorem4kStr, siz: lorem4kSiz, hdl: undefined }

              var storep = bf.store(lorem4kBuf)

              storep.then(
                function(hdl) {
                  blks[i].hdl = hdl;
                  i += 1
                  loop()
                }
              , function(err){ loop(err) })
            }
            /*results*/
          , function(err){
              done(err)
            }
          )
        })

    it("Should STILL have TWO segments", function(){
      expect(bf.segments.length).to.equal(2)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Write one 64k block & make sure it adds a segment", function(){
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


    it("Write a 64k buffer to file", function(done){

      lastIdx = nextIdx
      nextIdx = lastIdx + 1

      var i = lastIdx

      blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
      blks[i].str = lorem64kStr
      blks[i].siz = lorem64kSiz

      var storep = bf.store(lorem64kBuf)

      storep.then(
        function(hdl) {
          blks[i].hdl = hdl;
          done()
        }
      , function(err){ done(err) })
    })

    it("Should now have THREE segments", function(){
      expect(bf.segments.length).to.equal(3)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Fill the segment with 2046 more 64k blocks", function(){
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


    it("write a 64k buffer to file 2046 (NUM_BLOCKNUM/(MAX_SPANNUM+1)-1) times"
      , function(done){
          this.timeout(5000)

          lastIdx = nextIdx
          nextIdx = lastIdx + (NUM_BLOCKNUM/16 - 1)

          var i = lastIdx

          async.whilst(
            /*test*/
            function() { return i < nextIdx }
            /*body*/
          , function(loop){
              blks[i] = {
                /* str: lorem, siz: num, hdl: Handle */
              }
              blks[i].str = lorem64kStr
              blks[i].siz = lorem64kSiz

              var storep = bf.store(lorem64kBuf)
              storep.then(
                function(hdl){
                  blks[i].hdl = hdl
                  i += 1
                  loop()
                }
              , function(err){ loop(err) })
            }
            /*results*/
          , function(err){
              done(err)
            }
          )
        })

    it("Should STILL have THREE segments", function(){
      expect(bf.segments.length).to.equal(3)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })

  describe("Write one 4k block to make sure it starts a new segment", function(){
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


    it("write a 4k buffer to file", function(done){
      lastIdx = nextIdx
      nextIdx = lastIdx + 1

      var i = lastIdx

      blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
      blks[i].str = lorem4kStr
      blks[i].siz = lorem4kSiz

      var storep = bf.store(lorem4kBuf)
      storep.then(
        function(hdl) {
          blks[i].hdl = hdl;
          done()
        }
      , function(err){ done(err) })
    })

    it("should now have FOUR segments", function(){
      expect(bf.segments.length).to.equal(4)
    })

    it("bf.close()", function(done){
      bf.close(done)
    })

  })


  describe("Read all entries & compare to in memory list", function(){
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


    it("Read all blks.length blks[i].hdl"
      , function(done){
          this.timeout(10000)

          for (var j=0; j<blks.length; j+=1) {
            assert(!u.isUndefined(blks[j]), format("blks[%d] is undefined", j))
          }

          var i = 0

          async.whilst(
            /*test*/
            function() { return i < blks.length }
            /*body*/
          , function(loop){
              var loadp = bf.load(blks[i].hdl)
              loadp.spread(
                function(buf, hdl){
                  var siz, str

                  siz = buf.readUInt16BE(0)
                  expect(siz).to.equal(blks[i].siz)

                  str = buf.toString('utf8', 2, 2+siz)
                  expect(str).to.equal(blks[i].str)

                  i += 1
                  loop()
                }
              , loop)
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

  describe("Write the stats aut to "+outputFN, function(){
    it("should dump BlockFile.STATS", function(done){
      fs.writeFile(outputFN, BlockFile.STATS.toString({values:"both"})+"\n"
                  , function(){
                      if (err) { done(err); return }
                      done()
                    })
    })
  })

  //describe("BlockFile.open()", function(){
  //  it("", function(){})
  //})
})
