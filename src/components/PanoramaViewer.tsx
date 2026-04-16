/**
 * PanoramaViewer — Displays a stitched panorama in a WebGL cylindrical viewer.
 *
 * Works with any aspect ratio panorama (not just 2:1 equirectangular).
 * Supports touch pan (drag) and pinch-to-zoom.
 * Reads the image via readFileBase64 and renders in a WebView.
 */
import React, {useCallback, useRef, useState} from 'react';
import {View, StyleSheet, ActivityIndicator, Text, Platform, Image} from 'react-native';
import {WebView} from 'react-native-webview';
import type {WebViewMessageEvent} from 'react-native-webview';
import {readFileBase64} from '../modules/NativePhotosphere';
import RNFS from 'react-native-fs';

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
  var panX=0.5, panY=0.5;  // UV center of view (0..1)
  var zoom=1.0;             // 1 = show full height
  var txX=0,txY=0,txPanX=0,txPanY=0,lastPinch=0;
  var tex=null,prog=null,texReady=false;
  var texAspect=2.0;  // width/height of loaded texture

  function log(m){
    if(window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:''+m}));
  }

  var VS='attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}';

  // Fragment shader: maps screen to a portion of the panorama texture.
  // panX/panY = centre of view in UV space, zoom controls how much is visible.
  // Wraps horizontally for seamless panning on wide panoramas.
  var FS=[
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D t;',
    'uniform float uPanX, uPanY, uZoom, uAsp, uTexAsp;',
    'void main(){',
    '  float viewW = uAsp / (uTexAsp * uZoom);',
    '  float viewH = 1.0 / uZoom;',
    '  float u = uPanX + (v.x - 0.5) * viewW;',
    '  float vv = uPanY + (0.5 - v.y) * viewH;',
    '  u = fract(u);',  // wrap horizontally
    '  if(vv < 0.0 || vv > 1.0) { gl_FragColor = vec4(0,0,0,1); return; }',
    '  gl_FragColor = texture2D(t, vec2(u, 1.0 - vv));',
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
      texAspect=img.width/img.height;
      statusEl.style.display='none';
      log('tex loaded '+img.width+'x'+img.height+' aspect='+texAspect.toFixed(2));
    };
    img.onerror=function(){
      statusEl.textContent='Failed to load panorama';
      log('img load error');
    };
    img.src=src;
  }

  function render(){
    requestAnimationFrame(render);
    if(!prog||!texReady)return;
    gl.useProgram(prog);
    var asp=canvas.width/canvas.height;
    gl.uniform1f(gl.getUniformLocation(prog,'uPanX'),panX);
    gl.uniform1f(gl.getUniformLocation(prog,'uPanY'),panY);
    gl.uniform1f(gl.getUniformLocation(prog,'uZoom'),zoom);
    gl.uniform1f(gl.getUniformLocation(prog,'uAsp'),asp);
    gl.uniform1f(gl.getUniformLocation(prog,'uTexAsp'),texAspect);
    gl.uniform1i(gl.getUniformLocation(prog,'t'),0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }

  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      txX=e.touches[0].clientX; txY=e.touches[0].clientY;
      txPanX=panX; txPanY=panY;
    }else if(e.touches.length===2){
      var dx=e.touches[0].clientX-e.touches[1].clientX;
      var dy=e.touches[0].clientY-e.touches[1].clientY;
      lastPinch=Math.sqrt(dx*dx+dy*dy);
    }
  },{passive:false});

  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length===1){
      var dx=e.touches[0].clientX-txX;
      var dy=e.touches[0].clientY-txY;
      var asp=canvas.width/canvas.height;
      var viewW=asp/(texAspect*zoom);
      var viewH=1.0/zoom;
      panX=txPanX - dx/window.innerWidth*viewW;
      panY=txPanY + dy/window.innerHeight*viewH;
      panY=Math.max(0,Math.min(1,panY));
    }else if(e.touches.length===2){
      var dx2=e.touches[0].clientX-e.touches[1].clientX;
      var dy2=e.touches[0].clientY-e.touches[1].clientY;
      var d=Math.sqrt(dx2*dx2+dy2*dy2);
      zoom*=d/lastPinch;
      zoom=Math.max(0.5,Math.min(5,zoom));
      lastPinch=d;
    }
  },{passive:false});

  window._loadBase64=function(b64){loadImg('data:image/jpeg;base64,'+b64);};
  window._loadFile=function(url){loadImg(url);};

  function handleMsg(e){
    try{
      var d=JSON.parse(e.data);
      if(d.type==='loadBase64') loadImg('data:image/jpeg;base64,'+d.data);
    }catch(ex){}
  }
  document.addEventListener('message',handleMsg);
  window.addEventListener('message',handleMsg);

  initGL();
})();
</script>
</body>
</html>`;

type Props = {
  imagePath?: string;
  /** A require()'d image to use as placeholder when imagePath is not provided */
  placeholderSource?: number;
};

export default function PanoramaViewer({imagePath, placeholderSource}: Props) {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sentRef = useRef(false);

  const sendImage = useCallback(async () => {
    if (sentRef.current) return;
    sentRef.current = true;
    try {
      if (imagePath) {
        const base64 = await readFileBase64(imagePath);
        webRef.current?.injectJavaScript(`
          try { window._loadBase64(${JSON.stringify(base64)}); }
          catch(e) { if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:'err: '+e.message})); }
          true;
        `);
      } else if (placeholderSource) {
        // No image captured yet — load bundled placeholder
        const resolved = Image.resolveAssetSource(placeholderSource);
        let base64: string | null = null;

        if (Platform.OS === 'ios') {
          const uri = resolved.uri;
          if (uri.startsWith('file://')) {
            base64 = await RNFS.readFile(uri.replace('file://', ''), 'base64');
          } else {
            const response = await fetch(uri);
            const blob = await response.blob();
            base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
              };
              reader.readAsDataURL(blob);
            });
          }
        } else {
          const uri = resolved.uri;
          if (uri.startsWith('file://')) {
            base64 = await RNFS.readFile(uri.replace('file://', ''), 'base64');
          } else {
            base64 = await RNFS.readFileAssets(uri.replace('asset://', ''), 'base64');
          }
        }

        if (base64) {
          webRef.current?.injectJavaScript(`
            try { window._loadBase64(${JSON.stringify(base64)}); }
            catch(e) { if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type:'log',msg:'placeholder err: '+e.message})); }
            true;
          `);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to read file');
    }
  }, [imagePath, placeholderSource]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[PanoViewer]', data.msg);
      }
    } catch {}
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{html: VIEWER_HTML}}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        onLoadEnd={() => {
          setLoading(false);
          sendImage();
        }}
        onMessage={onMessage}
      />
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Preparing viewer…</Text>
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
  container: {flex: 1, backgroundColor: '#000'},
  webview: {flex: 1, backgroundColor: 'transparent'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingText: {color: '#fff', marginTop: 8, fontSize: 14},
  errorText: {color: '#f44', fontSize: 14, textAlign: 'center', padding: 20},
});
