/* Camera framing and touch reach share the same screen-space safety margin. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PingView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DEFAULT_HEIGHT=60, DEFAULT_DISTANCE=50;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function fitCamera(THREE,width,height,value=DEFAULT_HEIGHT,offset=54,distanceSetting=DEFAULT_DISTANCE) {
    const aspect=width/height,camera=new THREE.PerspectiveCamera(aspect<.8?47:42,aspect,.05,50);
    // Extend the low end from 30° to 18° while retaining the 57° ceiling.
    // The saved 60% recommendation now looks down at 41.4° instead of 46.2°.
    const angle=(18+clamp(value,0,100)*.39)*Math.PI/180,target=new THREE.Vector3(0,.78,-.05);
    const margin=Math.min(24,Math.max(20,width*.05)),top=Math.min(88,height*.15);
    const viewOffsetY=(Math.min(offset,120)+16-top)/2;
    camera.setViewOffset(width,height,0,viewOffsetY,width,height);
    // Fit the actual player and opponent ranges independently. The former
    // full-court box reserved the player's widest reach behind the opponent
    // as well, pushing the table unnecessarily far away. Keep every playable
    // paddle centre reachable; the blade may approach the rim on a wide save.
    const corners=[];
    for(const x of [-1.08,1.08])for(const y of [.86,1.52])for(const z of [.64,1.95])corners.push(new THREE.Vector3(x,y,z));
    for(const x of [-1.08,1.08])for(const y of [.76,1.65])for(const z of [-1.68,-.64])corners.push(new THREE.Vector3(x,y,z));
    const place=distance=>{
      camera.position.set(0,target.y+Math.sin(angle)*distance,target.z+Math.cos(angle)*distance);
      camera.lookAt(target);camera.updateMatrixWorld(true);
    };
    const fits=(distance,sideInset,topInset,bottomInset)=>{
      place(distance);
      return corners.every(p=>{const q=p.clone().project(camera),x=(q.x+1)*width/2,y=(1-q.y)*height/2;
        return x>=sideInset&&x<=width-sideInset&&y>=topInset&&y<=height-bottomInset;});
    };
    const fit=(lo,sideInset,topInset,bottomInset)=>{
      let hi=40;
      for(let i=0;i<24;i++){const d=(lo+hi)/2;if(fits(d,sideInset,topInset,bottomInset))hi=d;else lo=d;}
      return hi;
    };
    const recommended=fit(3.8,margin,top,Math.min(offset,120)+16);
    const setting=clamp(distanceSetting,0,100), delta=(setting-DEFAULT_DISTANCE)/50;
    // Dolly along the same sightline, not via FOV or a change of pitch.
    // The close end uses less framing padding, never a cropped reach area.
    const nearMargin=10;
    const close=delta<0?Math.min(recommended,fit(3.3,nearMargin,top*.70,Math.min(offset,120)+9)):recommended;
    const distance=delta<0?recommended+(recommended-close)*delta:recommended*(1+.42*delta);
    place(distance);
    return {position:camera.position.clone(),target,margin:delta<0?margin+(margin-nearMargin)*delta:margin,
      viewOffsetY,fov:camera.fov,height:clamp(value,0,100),angle:angle*180/Math.PI,distance,distanceSetting:setting};
  }
  // A smooth extra reach only in the outer 22% keeps the center directly under
  // the finger and makes the rail reachable without an OS-edge gesture.
  function touchX(x,width,inverse=false) {
    const center=width/2,half=width/2,t=(x-center)/half;
    const map=v=>v+Math.sign(v)*.10*Math.pow(clamp((Math.abs(v)-.56)/.36,0,1),2);
    if(!inverse)return center+map(t)*half;
    let lo=-1.2,hi=1.2;
    for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(map(mid)<t)lo=mid;else hi=mid;}
    return center+(lo+hi)/2*half;
  }
  return {DEFAULT_HEIGHT,DEFAULT_DISTANCE,fitCamera,touchX};
});
