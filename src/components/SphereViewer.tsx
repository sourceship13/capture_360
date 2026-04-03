/**
 * SphereViewer — equirectangular 360° panorama viewer using raw WebGL.
 *
 * No CDN dependencies — all rendering code is self-contained inline.
 * Reads the panorama via the native readFileBase64 module, then injects
 * it into the WebView as a data URL.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, StyleSheet, ActivityIndicator, Text} from 'react-native';
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

  function log(m){
    if(window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:''+m}));
  }

  var VS='attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}';

  var FS=[
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D t;',
    'uniform float uYaw,uPitch,uFov,uAsp;',
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
    '  vec2 uv=vec2(lon/(2.*PI)+.5,-lat/PI+.5);',
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

  function render(){
    requestAnimationFrame(render);
    if(!prog||!texReady)return;
    gl.useProgram(prog);
    var asp=canvas.width/canvas.height;
    gl.uniform1f(gl.getUniformLocation(prog,'uYaw'),yaw*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uPitch'),pitch*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uFov'),fov*Math.PI/180);
    gl.uniform1f(gl.getUniformLocation(prog,'uAsp'),asp);
    gl.uniform1i(gl.getUniformLocation(prog,'t'),0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      txX=e.touches[0].clientX;txY=e.touches[0].clientY;
      txYaw=yaw;txPitch=pitch;
    }else if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      lastPinch=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      yaw=(txX-e.touches[0].clientX)*.2+txYaw;
      pitch=(e.touches[0].clientY-txY)*.2+txPitch;
      pitch=Math.max(-85,Math.min(85,pitch));
    }else if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      var d=Math.sqrt(dx*dx+dy*dy);
      fov-=(d-lastPinch)*.15;
      fov=Math.max(30,Math.min(120,fov));
      lastPinch=d;
    }
  },{passive:false});

  var smoothYaw=0,smoothPitch=0;
  var smoothing=0.02;  // ultra smooth, minimal jitter
  
  window._loadBase64=function(b64){loadImg('data:image/jpeg;base64,'+b64);};
  window._loadFile=function(url){loadImg(url);};
  window._updateAttitude=function(yawRad,pitchRad){
    // Negate yaw to reverse direction (move left → dot comes closer)
    var targetYaw = -(yawRad*180/Math.PI);
    var targetPitch = pitchRad*180/Math.PI;
    
    // Low-pass filter to smooth jitter
    smoothYaw += (targetYaw - smoothYaw) * smoothing;
    smoothPitch += (targetPitch - smoothPitch) * smoothing;
    
    yaw = smoothYaw;
    pitch = Math.max(-85,Math.min(85,smoothPitch));
  };

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
  imagePath: string;
  /** Device attitude (yaw/pitch/roll) from motion sensors */
  attitude?: Attitude;
};

export default function SphereViewer({imagePath, attitude}: Props) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentRef = useRef(false);

  const sendImage = useCallback(async () => {
    if (sentRef.current) return;
    sentRef.current = true;

    try {
      console.log('[SphereViewer] reading image:', imagePath);
      const base64 = await readFileBase64(imagePath);
      console.log('[SphereViewer] base64 length:', base64.length);

      // Inject base64 data directly via JS — avoids file:// origin issues
      // and postMessage size limits. injectJavaScript handles large strings.
      webRef.current?.injectJavaScript(`
        try { window._loadBase64(${JSON.stringify(base64)}); } catch(e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:'inject err: '+e.message}));
        }
        true;
      `);
      setLoading(false);
    } catch (e: any) {
      console.log('[SphereViewer] error:', e.message);
      setError(e.message ?? 'Failed to read image');
      setLoading(false);
    }
  }, [imagePath]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[SphereViewer]', data.msg);
      }
    } catch {}
  }, []);

  // Inject device motion updates into WebGL viewer
  useEffect(() => {
    if (!attitude || !webRef.current) return;
    
    // DEBUG: Log raw device values to figure out the coordinate system
    console.log(`[DEVICE] yaw=${attitude.yaw.toFixed(1)} pitch=${attitude.pitch.toFixed(1)} roll=${attitude.roll.toFixed(1)}`);
    
    // SWAPPED AGAIN: empirical testing shows device's "pitch" drives horizontal movement
    // This means device labels are backwards from shader expectations
    const yawRad = (attitude.pitch * Math.PI) / 180;  // device pitch → shader yaw (horizontal)
    const pitchRad = (attitude.yaw * Math.PI) / 180;  // device yaw → shader pitch (vertical)
    
    webRef.current.injectJavaScript(`
      if (window._updateAttitude) {
        window._updateAttitude(${yawRad}, ${pitchRad});
      }
      true;
    `);
  }, [attitude]);

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
