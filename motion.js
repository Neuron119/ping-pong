/* A contact-anchored swing: anticipation, follow-through, recovery. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PingMotion=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  function stroke(p,pose,options={}) {
    const time=options.time||0,facing=options.side==='ai'?-1:1,hand=options.hand==='left'?-1:1;
    const age=time-(p.contactAt??-10),duration=.38;
    // Exactly zero displacement at contact. The visible blade stays at the
    // simulated impact point, then follows through and eases back to ready.
    const follow=age>=0&&age<duration?Math.sin(Math.PI*age/duration)*(1-age/duration):0;
    const prep=options.incoming&&options.eta>0?smooth(1-options.eta/.26):0;
    const preparation=age>.42?prep:0;
    const effort=options.side==='ai'?.7:clamp(Math.hypot(p.swingVX||0,p.swingVZ||0)/6,.2,1);
    const backhand=pose.key==='backhand'?-1:1;
    const push=pose.key==='push',smash=pose.key==='smash';
    return {
      x:facing*hand*backhand*follow*.035*effort,
      y:follow*(push?.012:smash?-.018:.022)*effort,
      z:facing*(-follow*.055*effort+preparation*.012),
      pitch:pose.pitch+facing*(preparation*.08-follow*(push?.12:.30)*effort),
      yaw:pose.yaw+facing*hand*backhand*(follow*.34*effort-preparation*.08),
      roll:pose.roll+facing*hand*(follow*.14*effort-preparation*.035),
      phase:follow>0?'follow':preparation>0?'prepare':'ready'
    };
  }
  return {stroke};
});
