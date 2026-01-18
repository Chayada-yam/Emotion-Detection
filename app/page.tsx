// import Image from "next/image";

// export default function Home() {
//   return (
//     <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
//       <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
//         <Image
//           className="dark:invert"
//           src="/next.svg"
//           alt="Next.js logo"
//           width={100}
//           height={20}
//           priority
//         />
//         <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
//           <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
//             To get started, edit the page.tsx file.
//           </h1>
//           <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
//             Looking for a starting point or more instructions? Head over to{" "}
//             <a
//               href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Templates
//             </a>{" "}
//             or the{" "}
//             <a
//               href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//               className="font-medium text-zinc-950 dark:text-zinc-50"
//             >
//               Learning
//             </a>{" "}
//             center.
//           </p>
//         </div>
//         <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
//           <a
//             className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
//             href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             <Image
//               className="dark:invert"
//               src="/vercel.svg"
//               alt="Vercel logomark"
//               width={16}
//               height={16}
//             />
//             Deploy Now
//           </a>
//           <a
//             className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
//             href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
//             target="_blank"
//             rel="noopener noreferrer"
//           >
//             Documentation
//           </a>
//         </div>
//       </main>
//     </div>
//   );
// }


"use client";

import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

type CvType = any;

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI States
  const [status, setStatus] = useState<string>("กำลังโหลดระบบ...");
  const [emotion, setEmotion] = useState<string>("-");
  const [conf, setConf] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Refs for Logic
  const cvRef = useRef<CvType | null>(null);
  const faceCascadeRef = useRef<any>(null);
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const classesRef = useRef<string[] | null>(null);
  const animationIdRef = useRef<number | null>(null); // เพิ่มตัวนี้เพื่อใช้ยกเลิก loop

  // --- LOGIC SECTION ---

  async function loadOpenCV() {
    if (typeof window === "undefined") return;
    if ((window as any).cv?.Mat) {
      cvRef.current = (window as any).cv;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/opencv/opencv.js";
      script.async = true;
      script.onload = () => {
        const cv = (window as any).cv;
        if (!cv) return reject(new Error("OpenCV error"));
        const waitReady = () => {
          if ((window as any).cv?.Mat) {
            cvRef.current = (window as any).cv;
            resolve();
          } else {
            setTimeout(waitReady, 50);
          }
        };
        if ("onRuntimeInitialized" in cv) {
          cv.onRuntimeInitialized = () => waitReady();
        } else {
          waitReady();
        }
      };
      script.onerror = () => reject(new Error("Failed to load opencv.js"));
      document.body.appendChild(script);
    });
  }

  async function loadCascade() {
    const cv = cvRef.current;
    if (!cv) throw new Error("cv not ready");
    const cascadeUrl = "/opencv/haarcascade_frontalface_default.xml";
    const res = await fetch(cascadeUrl);
    if (!res.ok) throw new Error("Cascade load failed");
    const data = new Uint8Array(await res.arrayBuffer());
    const cascadePath = "haarcascade_frontalface_default.xml";
    try { cv.FS_unlink(cascadePath); } catch {}
    cv.FS_createDataFile("/", cascadePath, data, true, false, false);
    const faceCascade = new cv.CascadeClassifier();
    if (!faceCascade.load(cascadePath)) throw new Error("Cascade load failed");
    faceCascadeRef.current = faceCascade;
  }

  async function loadModel() {
    const session = await ort.InferenceSession.create("/models/emotion_yolo.onnx", { executionProviders: ["wasm"] });
    sessionRef.current = session;
    const clsRes = await fetch("/models/classes.json");
    if (!clsRes.ok) throw new Error("Classes load failed");
    classesRef.current = await clsRes.json();
  }

  // ฟังก์ชันเริ่มกล้อง
  async function startCamera() {
    setStatus("กำลังขออนุญาตใช้กล้อง...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus("กำลังทำงาน (Running)");
      setIsStreaming(true);
      
      // เริ่ม Loop
      loop();
    } catch (err) {
      setStatus("ไม่สามารถเปิดกล้องได้");
      console.error(err);
    }
  }

  // ฟังก์ชันหยุดกล้อง (เพิ่มใหม่)
  function stopCamera() {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }

    setIsStreaming(false);
    setStatus("หยุดทำงานแล้ว (Stopped)");
    setEmotion("-");
    setConf(0);
    
    // เคลียร์ภาพค้างที่ Canvas
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function preprocessToTensor(faceCanvas: HTMLCanvasElement) {
    const size = 64;
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    const ctx = tmp.getContext("2d")!;
    ctx.drawImage(faceCanvas, 0, 0, size, size);
    const imgData = ctx.getImageData(0, 0, size, size).data;
    const float = new Float32Array(1 * 3 * size * size);
    let idx = 0;
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < size * size; i++) {
        const r = imgData[i * 4 + 0] / 255;
        const g = imgData[i * 4 + 1] / 255;
        const b = imgData[i * 4 + 2] / 255;
        float[idx++] = c === 0 ? r : c === 1 ? g : b;
      }
    }
    return new ort.Tensor("float32", float, [1, 3, size, size]);
  }

  function softmax(logits: Float32Array) {
    let max = -Infinity;
    for (const v of logits) max = Math.max(max, v);
    const exps = logits.map((v) => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / sum);
  }

  async function loop() {
    try {
      const cv = cvRef.current;
      const faceCascade = faceCascadeRef.current;
      const session = sessionRef.current;
      const classes = classesRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // ถ้าหยุด stream หรือ video หยุดเล่น ให้จบ loop
      if (!cv || !faceCascade || !session || !classes || !video || !canvas || video.paused || video.ended) {
         return; 
      }

      const ctx = canvas.getContext("2d")!;
      if (canvas.width !== video.videoWidth) {
         canvas.width = video.videoWidth;
         canvas.height = video.videoHeight;
      }
      
      ctx.drawImage(video, 0, 0);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      const faces = new cv.RectVector();
      const msize = new cv.Size(0, 0);
      faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);

      let bestRect: any = null;
      let bestArea = 0;

      for (let i = 0; i < faces.size(); i++) {
        const r = faces.get(i);
        const area = r.width * r.height;
        if (area > bestArea) {
          bestArea = area;
          bestRect = r;
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; 
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x, r.y, r.width, r.height);
      }

      if (bestRect) {
        const faceCanvas = document.createElement("canvas");
        faceCanvas.width = bestRect.width;
        faceCanvas.height = bestRect.height;
        const fctx = faceCanvas.getContext("2d")!;
        fctx.drawImage(canvas, bestRect.x, bestRect.y, bestRect.width, bestRect.height, 0, 0, bestRect.width, bestRect.height);

        const input = preprocessToTensor(faceCanvas);
        const feeds: Record<string, ort.Tensor> = {};
        feeds[session.inputNames[0]] = input;

        const out = await session.run(feeds);
        const logits = out[session.outputNames[0]].data as Float32Array;
        const probs = softmax(logits);
        
        let maxIdx = 0;
        for (let i = 1; i < probs.length; i++) {
          if (probs[i] > probs[maxIdx]) maxIdx = i;
        }

        const detectedEmotion = classes[maxIdx] ?? `class_${maxIdx}`;
        const confidence = probs[maxIdx] ?? 0;
        
        setEmotion(detectedEmotion);
        setConf(confidence);

        ctx.strokeStyle = "#ffffff"; 
        ctx.lineWidth = 4;
        ctx.strokeRect(bestRect.x, bestRect.y, bestRect.width, bestRect.height);

        ctx.fillStyle = "rgba(255, 255, 255, 0.85)"; 
        const text = `${detectedEmotion} ${(confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 16px sans-serif";
        const textWidth = ctx.measureText(text).width;
        
        ctx.fillRect(bestRect.x, bestRect.y - 35, textWidth + 24, 35);

        ctx.fillStyle = "#333333";
        ctx.fillText(text, bestRect.x + 12, bestRect.y - 12);
      }

      src.delete();
      gray.delete();
      faces.delete();

      animationIdRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      console.error(e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadOpenCV();
        await loadCascade();
        await loadModel();
        setStatus("พร้อมใช้งาน (Ready)");
        setIsLoading(false);
      } catch (e: any) {
        setStatus(`Error: ${e?.message}`);
      }
    })();
    // Cleanup เมื่อปิดหน้าเว็บ
    return () => stopCamera();
  }, []);

  // --- UI SECTION ---
  return (
    <main className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-8 font-sans transition-colors duration-300">
      
      {/* Header */}
      <div className="w-full max-w-5xl mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
         <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-6xl font-black mb-2 bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent drop-shadow-sm">
              Face Emotion AI
            </h1>
            <p className="text-foreground/60 text-lg">
              ตรวจจับอารมณ์ของคุณแบบ Real-time
            </p>
         </div>
         
         <div className={`px-4 py-2 rounded-full text-sm font-medium shadow-sm transition-all ${
           isLoading ? "bg-yellow-100 text-yellow-700 border border-yellow-200" :
           isStreaming ? "bg-green-100 text-green-700 border border-green-200" :
           "bg-gray-100 text-gray-600 border border-gray-200"
         }`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isLoading ? 'bg-yellow-500 animate-pulse' : isStreaming ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            {status}
         </div>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-8">
         
         {/* Left: Camera Feed */}
         <div className="lg:col-span-2 w-full flex flex-col gap-4">
            <div className="relative aspect-video bg-white rounded-3xl overflow-hidden border-4 border-white shadow-xl ring-1 ring-black/5">
               <video ref={videoRef} className="hidden" playsInline />
               <canvas
                 ref={canvasRef}
                 className="w-full h-full object-cover transform scale-x-[-1]" 
               />
               
               {!isStreaming && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10">
                     <p className="text-foreground/50 mb-4 font-medium text-lg">กดปุ่มเริ่มด้านล่างเพื่อใช้งาน</p>
                     <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl animate-bounce">
                        📷
                     </div>
                  </div>
               )}
            </div>

            {/* ปุ่มควบคุม (Control Buttons) - ตรงนี้ครับที่เพิ่มสีสัน */}
            <div className="flex gap-4 justify-center md:justify-start">
                {!isStreaming ? (
                    <button 
                        onClick={startCamera}
                        disabled={isLoading}
                        className="flex-1 md:flex-none px-8 py-3 rounded-2xl bg-[#4ade80] text-white font-bold text-lg shadow-[0_4px_0_#22c55e] active:shadow-none active:translate-y-[4px] hover:bg-[#22c55e] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span>▶</span> เริ่มกล้อง (Start)
                    </button>
                ) : (
                    <button 
                        onClick={stopCamera}
                        className="flex-1 md:flex-none px-8 py-3 rounded-2xl bg-[#fb7185] text-white font-bold text-lg shadow-[0_4px_0_#e11d48] active:shadow-none active:translate-y-[4px] hover:bg-[#e11d48] transition-all flex items-center justify-center gap-2"
                    >
                        <span>⏹</span> หยุดกล้อง (Stop)
                    </button>
                )}
            </div>
         </div>

         {/* Right: Dashboard Panel */}
         <div className="w-full flex flex-col gap-4">
            
            <div className="flex-1 bg-white/60 backdrop-blur-md border border-white/50 rounded-3xl p-6 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden min-h-[300px]">
               <h3 className="text-foreground/50 text-xs uppercase tracking-widest mb-4 font-bold">Detected Emotion</h3>
               <div className="text-5xl md:text-6xl font-black text-primary py-4 drop-shadow-sm animate-pulse">
                  {emotion === "-" ? "..." : emotion}
               </div>
               
               <div className="w-full mt-8 px-4">
                  <div className="flex justify-between text-xs text-foreground/50 mb-2 font-medium">
                     <span>ความมั่นใจ</span>
                     <span>{(conf * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50">
                     <div 
                        className="h-full bg-primary rounded-full shadow-inner" 
                        style={{ width: `${conf * 100}%`, transition: 'width 0.3s ease' }}
                     ></div>
                  </div>
               </div>
            </div>

            <div className="bg-white/40 border border-white/60 rounded-2xl p-5 text-xs text-foreground/60 leading-relaxed shadow-sm">
               <p className="flex items-start gap-2">
                 <span>🔒</span>
                 <span>ระบบทำงานบน Browser ของคุณ 100% ปลอดภัยหายห่วง</span>
               </p>
            </div>
         </div>
      </div>
    </main>
  );
}