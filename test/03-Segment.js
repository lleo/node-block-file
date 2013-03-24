/* global describe it */

var Handle = require('../lib/handle')
  , NaiveFSM = require('../lib/fsm_naive')
  , Segment = require('../lib/segment')
  , utils = require('../lib/utils')
  , signCRC16 = utils.signCRC16
//  , validateCRC16 = utils.validateCRC16
  , BLOCK_SIZE = Handle.BLOCK_SIZE
  , u = require('lodash')
  , assert = require('assert')
  , expect = require('chai').expect
  , log = console.log
  , format = require('util').format
  , sprintf = require('printf')
  , printf = require('../lib/utils').printf
  , eprintf = require('../lib/utils').eprintf

describe("Segment", function(){
  var seg, oseg, segNum, hdl
    , buf = new Buffer(BLOCK_SIZE)

  buf.fill(0xff)
  signCRC16(buf)

  segNum = 0
  seg = new Segment(segNum, buf, NaiveFSM)
  oseg = new Segment(segNum, buf, NaiveFSM)

  describe("Constructor", function(){
    it("should instantiate a new object", function(){
      expect(seg).to.be.instanceof(Segment)
    })
  })

  //A!describe("seg.reserve(numBlks)", function(){
  //A!  it("numBlks=undefined should throw", function(){
  //A!    expect(function(){seg.reserve()}).to.Throw("numBlks not an Integer")
  //A!  })
  //A!  it("numBlks=0 should throw", function(){
  //A!    expect(function(){seg.reserve(0)}).to.Throw("numBlks 0 < 1")
  //A!  })
  //A!  it("numBlks=17 should throw", function(){
  //A!    expect(function(){seg.reserve(17)}).to.Throw("numBlks 17 > MAX_SPANNUM+1 16")
  //A!  })
  //A!})

  describe("hdl = seg.reserve(1)", function(){
    it("hdl = seg.reserve(1) to return defined", function(){
      hdl = seg.reserve(1)
    })

    it("hdl.segNum == seg.segNum", function(){
      expect(hdl.segNum).to.equal(seg.segNum)
    })
    it("hdl.blkNum == 0", function(){
      expect(hdl.blkNum).to.equal(0)
    })
    it("hdl.spanNum == 0", function(){
      expect(hdl.spanNum).to.equal(0)
    })
  })

  describe("seg.release(hdl)", function(){
    it("should not blow up", function(){
      expect(function(){seg.release(hdl)}).to.not.Throw(Error)
    })
    it("seg should equal the original Segment object", function(){
      //expect(seg).to.deep.equal(oseg)
      expect(seg.equal(oseg)).to.be.true
    })
  })
})