import {describe,expect,it} from 'vitest';
import {zoomCrop} from './composition-geometry';

describe('zoomCrop non-square crops',()=>{
 it('preserves existing square behaviour',()=>{
  expect(zoomCrop([0,0,1,1],2)).toEqual([0.25,0.25,0.5,0.5]);
  expect(zoomCrop([0.25,0.25,0.5,0.5],1)).toEqual([0,0,1,1]);
 });
 it('preserves aspect ratio and centre for a wide crop',()=>{
  const result=zoomCrop([0.1,0.25,0.8,0.5],2);
  expect(result[2]).toBeCloseTo(0.5);
  expect(result[3]/result[2]).toBeCloseTo(0.5/0.8);
  expect(result[0]+result[2]/2).toBeCloseTo(0.5);
  expect(result[1]+result[3]/2).toBeCloseTo(0.5);
 });
 it('preserves aspect ratio and centre for a tall crop',()=>{
  const result=zoomCrop([0.35,0.2,0.3,0.6],2);
  expect(result[3]/result[2]).toBeCloseTo(0.6/0.3);
  expect(result[0]+result[2]/2).toBeCloseTo(0.5);
  expect(result[1]+result[3]/2).toBeCloseTo(0.5);
 });
 it('caps width for a tall crop at the height boundary',()=>{
  const result=zoomCrop([0.4,0.1,0.2,0.8],1);
  expect(result[3]).toBeCloseTo(1);
  expect(result[3]).toBeLessThanOrEqual(1);
  expect(result[2]).toBeCloseTo(0.25);
  expect(result[3]/result[2]).toBeCloseTo(0.8/0.2);
  expect(result[0]+result[2]/2).toBeCloseTo(0.5);
  expect(result[1]+result[3]/2).toBeCloseTo(0.5);
  expect(zoomCrop([0.4,0,0.2,1],3)[3]).toBeLessThanOrEqual(1);
 });
 it('keeps the zoom clamp at 1..3 while preserving aspect',()=>{
  expect(zoomCrop([0.1,0.25,0.8,0.5],0.5)[2]).toBeCloseTo(1);
  const zoomed=zoomCrop([0.1,0.25,0.8,0.5],99);
  expect(zoomed[3]/zoomed[2]).toBeCloseTo(0.5/0.8);
 });
});
