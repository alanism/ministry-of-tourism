import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {DevelopmentSampleReviewButton} from './TripApp';
import {GhostReviewButton} from './FreeBoard';
afterEach(()=>vi.unstubAllEnvs());
it('has no production sample control and fences a previously rendered development handler',()=>{
 const onReview=vi.fn();vi.stubEnv('DEV',true);const button=DevelopmentSampleReviewButton({onReview})!;expect(renderToStaticMarkup(button)).toContain('development samples');vi.stubEnv('DEV',false);expect(renderToStaticMarkup(createElement(DevelopmentSampleReviewButton,{onReview}))).toBe('');button.props.onClick();expect(onReview).not.toHaveBeenCalled();
});
it('dispatches a hosted ghost to its own review callback instead of native sample review',()=>{
 const hosted=vi.fn(),sample=vi.fn(),button=GhostReviewButton({ghost:{index:1001,stage:'plan',title:'Rome from actual provider',body:'',review:hosted},onReview:sample});button.props.onClick();expect(hosted).toHaveBeenCalledOnce();expect(sample).not.toHaveBeenCalled();
});
it('retains the native fallback only for a ghost without its own callback',()=>{const native=vi.fn(),button=GhostReviewButton({ghost:{index:2,stage:'plan',title:'Development sample',body:''},onReview:native});button.props.onClick();expect(native).toHaveBeenCalledExactlyOnceWith(2);});
