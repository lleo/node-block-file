
var u = require('lodash')
  , assert = require('chai').assert
//  , assert = require('assert')
  , Handle = require('./handle')
  , constants = require('./constants')
  , format = require('util').format
//  , sprintf = require('printf')
  , utils = require('./utils')
  , printf = require('./utils').printf
  , eprintf = require('./utils').eprintf
  , bufferReadBit = utils.bufferReadBit
  , bufferWriteBit = utils.bufferWriteBit
  , log = console.log

var BLOCK_SIZE   = constants.BLOCK_SIZE
  , MIN_SPANNUM  = Handle.MIN_SPANNUM
  , MAX_SPANNUM  = Handle.MAX_SPANNUM
  , MIN_BLOCKNUM = Handle.MIN_BLOCKNUM
  , MAX_BLOCKNUM = Handle.MAX_BLOCKNUM

/* IDEA: FreeSpaceMap abstract base class
 *
 * function FreeSpaceMap(segNum, buffer)   // abstract base class
 * FreeSpaceMap.prototype.alloc(numBlocks) // abstract
 * FreeSpaceMap.prototype.free(handle)     // abstract
 * FreeSpaceMap.prototype.validate(span)   // abstract
 */


/* Strategy: whatever is easy to implement
 * Alloc:
 *   0) remove exact match gap off the end of the free gap list (pop), and
 *      update the beg/end indexies.
 *   1) remove next largest available gap off free gap list (pop), split it
 *      up and re-store remainding gap and update the beg/end indexies.
 *
 * Free:
 *   0) determine if block span is adjacent to any free block gaps.
 *     If so merge upto 16 (store remainder as appropriate) record on
 *     free gap list (append) & free gap beg/end indexies.
 *
 *
 */

exports = module.exports = NaiveFSM
function NaiveFSM(buffer) {
  assert.equal(buffer.length, BLOCK_SIZE)

  this.freeBlockMap = []
  for (var l=MIN_BLOCKNUM; l<MAX_BLOCKNUM; l++) {
    this.freeBlockMap[l] = bufferReadBit(buffer,16+l) === 1
  }

  this.spans = []
  for (var g=MIN_SPANNUM; g<=MAX_SPANNUM; g++) {
    /* span = { beg: begNum, end: endNum } */
    this.spans[g] = [ /* span0, ..., spanN */ ]
  }

  // fsi => free span index so we don't have to findSpanLoc
  this.fsiBeg = { /* beg : boolean */ } //whether or not there is a span
  this.fsiEnd = { /* end : boolean */ }

  for ( var curBlockNum = MIN_BLOCKNUM;
        curBlockNum <= MAX_BLOCKNUM;
        curBlockNum += 1 )
  {
    var free = this.freeBlockMap[curBlockNum]
      , curSpanNum = MIN_SPANNUM
      , begSpan = curBlockNum

    if (free) {

      while(1) {
        if (!free || curSpanNum >= MAX_SPANNUM || curBlockNum >= MAX_BLOCKNUM) {
          //capture
          this.spans[curSpanNum].push({ beg: begSpan, end: begSpan+curSpanNum })
          this.fsiBeg[begSpan] = true
          this.fsiEnd[begSpan+curSpanNum] = true

          break
        }

        curBlockNum += 1
        curSpanNum += 1

        free = this.freeBlockMap[curBlockNum]
      } //while(1)
    } //if free
  } //foreach bit

  //return this
}

//util.inherits(NaiveFSM, FreeSpaceMap)

//NaiveFSM.prototype.log = NaiveFSM__log
//function NaiveFSM__log() {
//  var args = [].slice.apply(arguments)
//  console.log.apply(undefined, args)
//}
//
NaiveFSM.prototype.printf = NaiveFSM__printf
function NaiveFSM__printf() {
  var args = [].slice.apply(arguments)
  printf.apply(undefined, args)
}

NaiveFSM.equal = NaiveFSM_equal
function NaiveFSM_equal(a, b) {
  //a.freeBlockMap  [0..N] := bool
  //a.spans         [0..15][0..N] := {'beg': num, 'end': num}
  //a.fsiBeg        {num: bool}
  //a.fsiEnd        {num: bool}
  if ( !u.isEqual(a.freeBlockMap, b.freeBlockMap) ) return false
  if ( !u.isEqual(a.spans       , b.spans       ) ) return false
  if ( !u.isEqual(a.fsiBeg      , b.Beg         ) ) return false
  if ( !u.isEqual(a.fsiEnd      , b.End         ) ) return false

  return true
}

NaiveFSM.prototype.equal = NaiveFSM__equal
function NaiveFSM__equal(fsm) {
  //this.freeBlockMap  [0..N] := bool
  //this.spans         [0..15][0..N] := {'beg': num, 'end': num}
  //this.fsiBeg        {num: bool}
  //this.fsiEnd        {num: bool}
  var i,j
  if ( !u.isEqual(this.freeBlockMap, fsm.freeBlockMap) ) return false
  if ( !u.isEqual(this.spans, fsm.spans) ) return false
  if ( !u.isEqual(this.fsiBeg, fsm.Beg) ) return false
  if ( !u.isEqual(this.fsiEnd, fsm.End) ) return false

  return true
} //NaiveFSM__equal()


/** Allocate a number of blocks of contiguous space
 *
 * @param {number} spanNumm [spanNum=0] allocate one + spanNum number of blocks
 * @returns {object} {beg: begBlkNum, end: endBlkNum} endBlkNum - begBlkNum == spanNum
 */
/* alternative @returns to consider
 * @returns {Array} [begBlkNum, endBlkNum]
 * @returns {Array} [begBlkNum, spanNum]
 * @returns {number} begBlkNum where spanNum is implied
 */
NaiveFSM.prototype.alloc = NaiveFSM__alloc
function NaiveFSM__alloc(reqSpanNum) {
  if (reqSpanNum === undefined) reqSpanNum = MIN_SPANNUM

  Handle.assertValidSpanNum( reqSpanNum )
//  assert(reqSpanNum >= MIN_SPANNUM,
//         format("reqSpanNum(%d) < MIN_SPANNUM(%d)", reqSpanNum, MIN_SPANNUM))
//  assert(spanNum <= MAX_SPANNUM,
//         format("spanNum(%d) >= MAX_SPANNUM(%d)", reqSpanNum, MAX_SPANNUM))

  var spanNum, span
  for (spanNum = reqSpanNum; spanNum <= MAX_SPANNUM; spanNum += 1) {
    if (this.spans[spanNum].length > 0) {
      //FIXME: use this.delete_(spanNum, idx)
      span = this.spans[spanNum].shift()
      delete this.fsiBeg[span.beg]
      delete this.fsiEnd[span.end]
      break
    }
  }

  // if span size > number of blocs I'm looking for
  //   extract the number of blocks and reinsert the rest as a new span
  var newSpan, remSpan
  if ( span.end - span.beg > reqSpanNum ) {
    newSpan = {beg: span.beg, end: span.beg + reqSpanNum}
    remSpan = {beg: newSpan.end + 1, end: span.end}

//    log("newSpan =", newSpan)
//    log("remSpan =", remSpan)

    //re-insert remSpan; preserve ordering of this.spans[spanNum]
    this.insert_(remSpan)
  }
  else newSpan = span

  return newSpan
} //NaiveFSM__alloc()


NaiveFSM.prototype.free = NaiveFSM__free
function NaiveFSM__free(span) {
  var spanNum

  assert.instanceOf( span, Object )

  spanNum = span.end - span.beg

  assert.ok(this.isValid(span)) //isValid is expensive; scans all spans

  var adjSpanLoc, adjSpan

  // loc is of the form {spanNum: num, idx: num}
  adjSpanLoc = this.findSpanLocBeg_(span.end+1) //expensive scan of most spans
  if ( adjSpanLoc ) {
    // remove adjacent span
    adjSpan = this.spans[adjSpanLoc.span].splice(adjSpanLoc.idx, 1)[0]
    delete this.fsiBeg[adjSpan.beg]
    delete this.fsiEnd[adjSpan.end]

    // create new merged span
    span = { beg: span.beg, end: adjSpan.end }
  }

  // loc is of the form {spanNum: num, idx: num}
  adjSpanLoc = this.findSpanLocEnd_(span.beg-1) //expensive scan of most spans
  if ( adjSpanLoc ) {
    // remove adjacent span
    adjSpan = this.spans[adjSpanLoc.span].splice(adjSpanLoc.idx, 1)[0]
    delete this.fsiBeg[adjSpan.beg]
    delete this.fsiEnd[adjSpan.end]

    // create new merged span
    span = { beg: adjSpan.beg, end: span.end }
  }

  var span2
  while (span.end - span.beg > MAX_SPANNUM) {
    //ex span={beg:0,end:16} => span2={beg:1,end:16} & span'={beg:0,end:0}
    //ex span={beg:0,end:32} => span2={beg:17,end:32} & span'={beg:0,end:16}
    //                          span2'={beg:1,end:16} & span''={beg:0,end:0}
    span2 = {beg: span.end - MAX_SPANNUM, end: span.end}
    span.end -=  MAX_SPANNUM+1
    this.insert_(span2)
  }
  // insert new merged span and its split partner
  this.insert_(span)
} //NaiveFSM__free()


NaiveFSM.prototype.findSpanLocBeg_ = NaiveFSM__findSpanLocBeg_
function NaiveFSM__findSpanLocBeg_(beg) {
  if ( this.fsiBeg[beg] === undefined) return undefined

  for (var spanNum = MIN_SPANNUM; spanNum <= MAX_SPANNUM; spanNum += 1) {
    for (var idx = 0; idx < this.spans[spanNum].length; idx += 1) {
      if ( this.spans[spanNum][idx].beg === beg )
        return {span: spanNum, idx: idx} //this.spans[spanNum][idx]
    } //for each idx
  } //for each spanNum

  return undefined
}


NaiveFSM.prototype.findSpanLocEnd_ = NaiveFSM__findSpanLocEnd_
function NaiveFSM__findSpanLocEnd_(end) {
  if ( this.fsiEnd[end] === undefined) return undefined

  for (var spanNum = MIN_SPANNUM; spanNum <= MAX_SPANNUM; spanNum += 1) {
    for (var idx = 0; idx < this.spans[spanNum].length; idx += 1) {
      if ( this.spans[spanNum][idx].end === end )
        return {span: spanNum, idx: idx} //this.spans[spanNum][idx]
    } //for each idx
  } //for each spanNum

  return undefined
}


NaiveFSM.prototype.insert_ = NaiveFSM__insert_
function NaiveFSM__insert_(span) {
  var idx, spanNum = span.end - span.beg

//  log("span =", span)
//  log("spanNum =", spanNum)

  assert.ok(Array.isArray(this.spans[spanNum]))

  if (this.spans[spanNum].length === 0) {
    idx = 0
    this.spans[spanNum].push(span)
    //this.spans[spanNum][idx] = span
  }
  else {
    for (idx = 0; idx < this.spans[spanNum].length; idx += 1) {
      assert.ok(this.spans[spanNum][idx].beg !== span.beg)
      if (this.spans[spanNum][idx].beg > span.beg) break
    }
    //above loop either broke on idx<.length or idx==.length; both ok
    this.spans[spanNum].splice(idx, 0, span)
  }

  this.fsiBeg[span.beg] = true
  this.fsiEnd[span.end] = true
} //insert_()

NaiveFSM.prototype.delete_ = NaiveFSM__delete_
function NaiveFSM__delete_(spanNum, idx) {
  var span = this.spans[spanNum].splice(idx, 1)[0]
  delete this.fsiBeg[span.beg]
  delete this.fsiEnd[span.end]
}

function spanIntersects(a, b) {

  if ((a.beg <= b.beg) && (b.beg <= a.end)) return true
  if ((a.beg <= b.end) && (b.end <= a.end)) return true

  if ((b.beg <= a.beg) && (a.beg <= b.end)) return true
  if ((b.beg <= a.end) && (a.end <= b.end)) return true //this won't execute

  return false
}

NaiveFSM.prototype.isValid = NaiveFSM__isValid
function NaiveFSM__isValid(span) {
  //span {beg: <number>, end: <number>}

  //make sure span does not intersect with any other span
  //maybe forAllSpans(function(span, spanNum, idx){...})
  for (var spanNum = MIN_SPANNUM; spanNum <= MAX_SPANNUM; spanNum += 1) {
    for (var idx=0; idx < this.spans[spanNum].length; idx += 1) {
      var s = this.spans[spanNum][idx]  //s = {beg: num, end: num}

      if ( spanIntersects(span, s) ) return false

    } //for each idx in this.spans[spanNum]
  } //for each spanNum (0..15)

  return true
} //NaiveFSM__isValid
