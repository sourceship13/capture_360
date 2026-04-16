/**
 * SphereViewer — equirectangular 360° panorama viewer using raw WebGL.
 *
 * No CDN dependencies — all rendering code is self-contained inline.
 * Reads the panorama via the native readFileBase64 module, then injects
 * it into the WebView as a data URL.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, StyleSheet, ActivityIndicator, Text, Image} from 'react-native';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';
import {readFileBase64} from '../modules/NativePhotosphere';
import type {Attitude} from '../hooks/useAttitude';

// ── Raw WebGL equirectangular viewer ──────────────────────────────────────────

const VIEWER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport"
  content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{margin:0;padding:0;overflow:hidden}
  body,html{width:100%;height:100%;background:#000}
  canvas{display:block;width:100vw;height:100vh;touch-action:none}
  #status{position:absolute;inset:0;display:flex;align-items:center;
    justify-content:center;color:#fff;font-family:system-ui;font-size:14px;
    pointer-events:none;z-index:10}
</style>
</head>
<body>
<div id="status">Loading panorama…</div>
<canvas id="c"></canvas>
<script>
(function(){
  var canvas=document.getElementById('c');
  var gl=canvas.getContext('webgl')||canvas.getContext('experimental-webgl');
  var statusEl=document.getElementById('status');
  var yaw=0,pitch=0,fov=75;
  var txYaw=0,txPitch=0,txX=0,txY=0,lastPinch=0;
  var tex=null,prog=null,texReady=false;
  var touchOffsetYaw=0,touchOffsetPitch=0;
  var isTouching=false;
  var baseYaw=0,basePitch=0;

  function log(m){
    if(window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:''+m}));
  }

  var VS='attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}';

  var FS=[
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D t;',
    'uniform float uYaw,uPitch,uFov,uAsp,uVShift;',
    '#define PI 3.14159265',
    'void main(){',
    '  float hf=uFov*.5;',
    '  float x=(v.x-.5)*2.*tan(hf)*uAsp;',
    '  float y=(v.y-.5)*2.*tan(hf);',
    '  vec3 r=normalize(vec3(x,y,-1.));',
    '  float cp=cos(uPitch),sp=sin(uPitch);',
    '  r=vec3(r.x,cp*r.y-sp*r.z,sp*r.y+cp*r.z);',
    '  float cy=cos(uYaw),sy=sin(uYaw);',
    '  r=vec3(cy*r.x+sy*r.z,r.y,-sy*r.x+cy*r.z);',
    '  float lon=atan(r.x,-r.z);',
    '  float lat=asin(clamp(r.y,-1.,1.));',
    '  vec2 uv=vec2(-lon/(2.*PI)+.5,-lat/PI+.5+uVShift);',
    '  gl_FragColor=texture2D(t,uv);',
    '}'
  ].join('\\n');

  function sh(type,src){
    var s=gl.createShader(type);
    gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      log('shader err: '+gl.getShaderInfoLog(s));return null;}
    return s;
  }

  function initGL(){
    var dpr=window.devicePixelRatio||1;
    canvas.width=window.innerWidth*dpr;
    canvas.height=window.innerHeight*dpr;
    gl.viewport(0,0,canvas.width,canvas.height);
    var vs=sh(gl.VERTEX_SHADER,VS);
    var fs=sh(gl.FRAGMENT_SHADER,FS);
    if(!vs||!fs){log('shader compile failed');return;}
    prog=gl.createProgram();
    gl.attachShader(prog,vs);gl.attachShader(prog,fs);
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){
      log('link err: '+gl.getProgramInfoLog(prog));return;}
    var buf=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    var a=gl.getAttribLocation(prog,'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    gl.useProgram(prog);
    tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    log('WebGL init ok');
    render();
  }

  function loadImg(src){
    var img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      texReady=true;
      statusEl.style.display='none';
      log('tex loaded '+img.width+'x'+img.height);
    };
    img.onerror=function(){
      statusEl.textContent='Failed to load panorama';
      log('img load error for: '+src.substring(0,80));
    };
    img.src=src;
  }

  var vShift=0;
  window._setVShift=function(s){ vShift=s; };

  function render(){
    requestAnimationFrame(render);
    if(!prog||!texReady)return;
    gl.useProgram(prog);
    var asp=canvas.width/canvas.height;
    var finalYaw = (gyroActive && !isTouching ? smoothYaw : 0) + baseYaw + touchOffsetYaw;
    var finalPitch = (gyroActive && !isTouching ? smoothPitch : 0) + basePitch + touchOffsetPitch;
    finalPitch = Math.max(-85,Math.min(85,finalPitch));
    gl.uniform1f(gl.getUniformLocation(prog,'uYaw'),finalYaw*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uPitch'),finalPitch*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uFov'),fov*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uAsp'),asp);
    gl.uniform1f(gl.getUniformLocation(prog,'uVShift'),vShift);
    gl.uniform1i(gl.getUniformLocation(prog,'t'),0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    isTouching=true;
    if(e.touches.length===1){
      txX=e.touches[0].clientX;txY=e.touches[0].clientY;
      txYaw=touchOffsetYaw;txPitch=touchOffsetPitch;
    }else if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      lastPinch=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      touchOffsetYaw=(e.touches[0].clientX-txX)*.2+txYaw;
      touchOffsetPitch=(txY-e.touches[0].clientY)*.2+txPitch;
      touchOffsetPitch=Math.max(-85,Math.min(85,touchOffsetPitch));
      // Also update non-gyro yaw/pitch for when gyro is off
      yaw=smoothYaw+touchOffsetYaw;
      pitch=Math.max(-85,Math.min(85,smoothPitch+touchOffsetPitch));
    }else if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      var d=Math.sqrt(dx*dx+dy*dy);
      fov-=(d-lastPinch)*.15;
      fov=Math.max(30,Math.min(120,fov));
      lastPinch=d;
    }
  },{passive:false});

  canvas.addEventListener('touchend',function(e){
    if(e.touches.length===0) isTouching=false;
  },{passive:false});

  var smoothYaw=0,smoothPitch=0;
  var smoothing=0.25;  // snappy tracking with minimal jitter
  var gyroActive=false;
  
  window._loadBase64=function(b64){loadImg('data:image/jpeg;base64,'+b64);};
  window._loadFile=function(url){loadImg(url);};
  window._setInitialView=function(y,p){
    baseYaw=y;basePitch=p;
    yaw=y;pitch=p;smoothYaw=0;smoothPitch=0;
    touchOffsetYaw=0;touchOffsetPitch=0;
    log('✅ initial view set: yaw='+y+'° pitch='+p+'°');
  };
  window._updateAttitude=function(yawDeg,pitchDeg){
    gyroActive=true;
    var targetYaw = -yawDeg;
    var targetPitch = -pitchDeg;
    // Wrap-safe delta for yaw (avoid 360° snap at ±180° boundary)
    var dy = targetYaw - smoothYaw;
    if(dy > 180) dy -= 360;
    if(dy < -180) dy += 360;
    smoothYaw += dy * smoothing;
    smoothPitch += (targetPitch - smoothPitch) * smoothing;
    
    yaw = smoothYaw;
    pitch = Math.max(-85,Math.min(85,smoothPitch));
  };
  window._setGyroActive=function(on){ gyroActive=on; };

  function handleMsg(e){
    try{
      var d=JSON.parse(e.data);
      if(d.type==='loadFile') loadImg(d.url);
      else if(d.type==='loadBase64') loadImg('data:image/jpeg;base64,'+d.data);
    }catch(ex){log('msg err: '+ex.message);}
  }

  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);

  initGL();
})();
</script>
</body>
</html>`;

// ── React Native component ────────────────────────────────────────────────────

type Props = {
  /** Absolute file path to an equirectangular JPEG panorama. */
  imagePath?: string;
  /** A require()'d image to use as placeholder when imagePath is not provided */
  placeholderSource?: number;
  /** Device attitude (yaw/pitch/roll) from motion sensors */
  attitude?: Attitude;
  /** Enable gyroscope-driven panning (requires attitude to be provided) */
  gyroEnabled?: boolean;
  /** Shift the virtual eye level up (positive) or down (negative) within the sphere.
   *  Range ~0.0–0.15; 0.08 ≈ standing height in a typical room panorama. */
  heightOffset?: number;
  /** Initial camera position (yaw/pitch in degrees) — defaults to first shot's orientation */
  initialYaw?: number;
  initialPitch?: number;
};

export default function SphereViewer({imagePath, placeholderSource, attitude, gyroEnabled = false, heightOffset = 0, initialYaw = 180, initialPitch = 0}: Props) {
  console.log('[SphereViewer] Mounting with initial:', {initialYaw, initialPitch, gyroEnabled, heightOffset});
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentRef = useRef(false);

  const sendImage = useCallback(async () => {
    if (sentRef.current) return;
    sentRef.current = true;

    // Set initial camera position BEFORE loading image
    webRef.current?.injectJavaScript(`
      try {
        if (window._setInitialView) {
          window._setInitialView(${initialYaw}, ${initialPitch});
        }
        if (window._setVShift) {
          window._setVShift(${heightOffset});
        }
      } catch(e) {}
      true;
    `);

    try {
      if (imagePath) {
        // Load from file system
        console.log('[SphereViewer] reading image:', imagePath);
        const base64 = await readFileBase64(imagePath);
        console.log('[SphereViewer] base64 length:', base64.length);
        webRef.current?.injectJavaScript(`
          try { window._loadBase64(${JSON.stringify(base64)}); } catch(e) {}
          true;
        `);
      } else if (placeholderSource) {
        // Load from RN bundled asset via fetch → blob → dataURL
        const resolved = Image.resolveAssetSource(placeholderSource);
        console.log('[SphereViewer] loading placeholder:', resolved?.uri?.substring(0, 80));
        const response = await fetch(resolved.uri);
        const blob = await response.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        webRef.current?.injectJavaScript(`
          try { window._loadFile(${JSON.stringify(dataUrl)}); } catch(e) {}
          true;
        `);
      } else {
        setError('No image source provided');
      }
      setLoading(false);
    } catch (e: any) {
      console.log('[SphereViewer] error:', e.message);
      setError(e.message ?? 'Failed to read image');
      setLoading(false);
    }
  }, [imagePath, placeholderSource, initialPitch, initialYaw]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[SphereViewer]', data.msg);
      }
    } catch {}
  }, []);

  // Device motion tracking — throttled to ~15fps to reduce bridge overhead and heat
  const lastGyroRef = useRef(0);
  useEffect(() => {
    if (!gyroEnabled || !attitude || !webRef.current) return;
    
    const now = Date.now();
    if (now - lastGyroRef.current < 33) return; // ~30fps
    lastGyroRef.current = now;
    
    webRef.current.injectJavaScript(`
      if (window._updateAttitude) {
        window._updateAttitude(${attitude.yaw}, ${attitude.pitch});
      }
      true;
    `);
  }, [gyroEnabled, attitude]);

  return (
    <View style={styles.root}>
      <WebView
        ref={webRef}
        source={{html: VIEWER_HTML}}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onLoad={sendImage}
        onMessage={onMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.overlayText}>Loading panorama…</Text>
        </View>
      )}
      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  webview: {flex: 1, backgroundColor: '#000'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayText: {color: '#fff', marginTop: 12, fontSize: 14},
  errorText: {color: '#ef4444', fontSize: 14, textAlign: 'center', padding: 24},
});
