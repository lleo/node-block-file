/* global describe it */

var Handle = require('../lib/handle')
  , BlockFile = require('../lib/block_file')
  , fs = require('fs')
  , async = require('async')
  , assert = require('assert')
  , expect = require('chai').expect
  , util = require('util')
  , format = util.format

var Props = require('../lib/props')
  , props = Props.defaultProps
  , NUM_SPANNUM = props.numSpanNums
  , NUM_BLOCKNUM = props.numBlkNums

var filename ='test.bf'
  , fnStat
  , lorem4k_fn = 'lorem-ipsum.4k.txt'
  , lorem4kStr
  , lorem4kSiz
  , lorem4kBuf
  , lorem64k_fn = 'lorem-ipsum.64k.txt'
  , lorem64kStr
  , lorem64kSiz
  , lorem64kBuf
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
lorem4kBuf = new Buffer( 4 + lorem4kSiz )
lorem4kBuf.writeUInt32BE( lorem4kSiz, 0 )
lorem4kBuf.write( lorem4kStr, 4, lorem4kSiz, 'utf8' )
assert.ok(lorem4kBuf.length < 4*1024) //lorem4kStr.length < 4*1024-4

lorem64kStr  = fs.readFileSync(lorem64k_fn, 'utf8')
lorem64kSiz = Buffer.byteLength( lorem64kStr, 'utf8' )
lorem64kBuf = new Buffer( 4 + lorem64kSiz )
lorem64kBuf.writeUInt32BE( lorem64kSiz, 0 )
lorem64kBuf.write( lorem64kStr, 4, lorem64kSiz, 'utf8' )
assert.ok(lorem64kBuf.length < 64*1024) //lorem64kStr.length < 64*1024-4


describe("BlockFile", function(){
  var blks = [], nextIdx, lastIdx

  //describe("BlockFile.create()", function(){
  describe("BlockFile.open()", function(){
    var bf

    it("should create a file "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){ bf = bf_; done() }, done )

      //BlockFile.open(filename, function(err, bf_){
      //  bf = bf_
      //  if (err) {
      //    done(err)
      //    return
      //  }
      //  expect(bf).to.be.an.instanceof(BlockFile)
      //  //expect(bf instanceof BlockFile).to.be.true
      //  done()
      //})
    })


    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Write the FIRST 4k block", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
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
          //console.log("blks[%d].hdl = %s", i, hdl)
          blks[i].hdl = hdl;
          done()
        }
      , function(err){ done(err) })
    })

    it("Should now have ONE segment", function(){
      expect(bf.segments.length).to.equal(1)
    })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Read the FIRST 4k block", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("Read the previous 4k buffer from file", function(done){
      var i = lastIdx
        , loadp = bf.load(blks[i].hdl)

      loadp.spread(
        function(buf, hdl){
          var siz, str

          siz = buf.readUInt32BE(0)
          expect(siz).to.equal(blks[i].siz)

          str = buf.toString('utf8', 4, 4+siz)
          expect(str).to.equal(blks[i].str)

          done()
        }
      , function(err){ done(err) })
    })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Fill the segment with 32751 4k (NUM_BLOCKNUM-1) more blocks", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("Write a 4k buffer to file 32751 (NUM_BLOCKNUM-1) times"
      , function(done){
          this.timeout(10*1000)

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

              bf.store(lorem4kBuf).then(
                function(hdl) {
                  //console.log("blks[%d].hdl = %s", i, hdl)
                  blks[i].hdl = hdl;
                  i += 1
                  loop()
                }
              , function(err) { loop(err) })
            }
            /*results*/
          , function(err){ done(err) } )

        })
    it("Should STILL have only ONE segment", function(){
      expect(bf.segments.length).to.equal(1)
    })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Read the whole segment of 32752 4k (NUM_BLOCKNUM) blocks", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("Read 32752 (NUM_BLOCKNUM) 4k blocks"
      , function(done){
          this.timeout(10*1000)

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

                  siz = buf.readUInt32BE(0)
                  expect(siz).to.equal(blks[0].siz)

                  str = buf.toString('utf8', 4, 4+siz)

                  expect(str).to.equal(blks[i].str)

                  i += 1
                  loop()
                }
              , loop)
            }
            /*results*/
          , function(err){ done(err) })

        })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Write one 4k block & make sure it adds a segment", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
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
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Fill the segment with 32751 more (NUM_BLOCKNUM-1) 4k blocks", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("Write a 4k buffer to file 32751 (NUM_BLOCKNUM-1) times"
      , function(done){
          this.timeout(10*1000)

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
          , function(err){ done(err) })
        })

    it("Should STILL have TWO segments", function(){
      expect(bf.segments.length).to.equal(2)
    })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Write one 64k block & make sure it adds a segment", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
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
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Fill the segment with 2046 more 64k blocks", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("write a 64k buffer to file 2046 (NUM_BLOCKNUM/NUM_SPANNUM - 1) times"
      , function(done){
          this.timeout(5*1000)

          lastIdx = nextIdx
          nextIdx = lastIdx + (NUM_BLOCKNUM/NUM_SPANNUM - 1)

          var i = lastIdx
          async.whilst(
            /*test*/
            function() { return i < nextIdx }
            /*body*/
          , function(loop){
              blks[i] = {/*str: lorem, siz: num, hdl: Handle*/}
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
          , function(err){ done(err) })
        })

    it("Should STILL have THREE segments", function(){
      expect(bf.segments.length).to.equal(3)
    })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })

  describe("Write one 4k block to make sure it starts a new segment", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
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
      //bf.close(done)
      bf.close().then(done, done)
    })

  })


  describe("Read all entries & compare to in memory list", function(){
    var bf

    it("should open "+filename, function(done){
      BlockFile.open(filename)
      .then(function(bf_){
        expect(bf_).to.be.an.instanceof(BlockFile)
        bf = bf_
        done()
      }, done )
    })


    it("Read all blks.length blks[i].hdl"
      , function(done){
          this.timeout(10*1000)

          for (var j=0; j<blks.length; j+=1) {
            assert(typeof blks[j] != 'undefined', format("blks[%d] is undefined", j))
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

                  siz = buf.readUInt32BE(0)
                  expect(siz).to.equal(blks[i].siz)

                  str = buf.toString('utf8', 4, 4+siz)
                  expect(str).to.equal(blks[i].str)

                  i += 1
                  loop()
                }
              , loop)
            }
            /*results*/
          , function(err){ done(err) })
        })

    it("bf.close()", function(done){
      //bf.close(done)
      bf.close().then(done, done)
    })

  })

  describe("Write the stats aut to "+outputFN, function(){
    it("should dump BlockFile.STATS", function(done){
      fs.writeFile(outputFN, BlockFile.STATS.toString({values:"both"})+"\n"
                  , function(err){ done(err) })
    })
  })

})
