/* global describe it */

var Handle = require('../lib/handle')
  , expect = require('chai').expect
  , assert = require('assert')
  , sprintf = require('printf')
  , fprintf = sprintf

describe("Handle", function(){

  describe("Constructor segNum=MIN_SEGNUM, blkNum=MIN_BLOCKNUM, blkSpan=MIN_SPANNUM", function(){
    it("should generate a binary value of 0", function(){
      var hdl = new Handle( Handle.MIN_SEGNUM
                          , Handle.MIN_BLOCKNUM
                          , Handle.MIN_SPANNUM )
      expect(hdl.encode()).to.equal(0)
    })
  })

  describe("Constructor segNum=MAX_SEGNUM, blkNum=MAX_BLOCKNUM, blkSpan=MAX_SPANNUM", function(){
    it("should generate a binary value of 0xfffdffff>>0", function(){
      var hdl = new Handle( Handle.MAX_SEGNUM
                          , Handle.MAX_BLOCKNUM
                          , Handle.MAX_SPANNUM )
//        , expected = Handle.MAX_SEGNUM   << Handle.SEGNUM_OFFSET   |
//                     Handle.MAX_BLOCKNUM << Handle.BLOCKNUM_OFFSET |
//                     Handle.MAX_SPANNUM  << Handle.SPANNUM_OFFSET //-131073
//        , expected = 0xfffdffff     //4294836223 uint32
        , expected = 0xfffdffff>>00  //-131073 int32
//        , expected = 0xfffdffff>>>00 //-131073 uint32

      expect(hdl.encode()).to.equal(expected)
    })
  })

  describe("Handle.decode()", function(){
    it ("should decode another handle's 'value' resulting in an identical handle", function(){
      var hdl1 = new Handle(3, 1111, 0)
        , hdl2 = Handle.decode(hdl1.encode())
      expect(hdl1).to.deep.equal(hdl2)
    })
  })

})