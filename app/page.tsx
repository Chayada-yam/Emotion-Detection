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

  // --- LOGIC SECTION (เหมือนเดิม) ---

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
      requestAnimationFrame(loop);
    } catch (err) {
      setStatus("ไม่สามารถเปิดกล้องได้");
      console.error(err);
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

      if (!cv || !faceCascade || !session || !classes || !video || !canvas) {
        requestAnimationFrame(loop);
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
        // วาดกรอบจางๆ สำหรับหน้าที่ไม่ได้โฟกัส
        ctx.strokeStyle = "rgba(147, 51, 234, 0.3)"; // Primary muted
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

        // --- DRAW ON CANVAS ---
        // 1. กรอบหน้าชัดๆ
        ctx.strokeStyle = "#d8b4fe"; // Neon Purple
        ctx.lineWidth = 4;
        ctx.strokeRect(bestRect.x, bestRect.y, bestRect.width, bestRect.height);

        // 2. ป้ายชื่อ (Background)
        ctx.fillStyle = "rgba(15, 7, 32, 0.8)"; // Deep Void opacity
        const text = `${detectedEmotion} ${(confidence * 100).toFixed(0)}%`;
        const textWidth = ctx.measureText(text).width;
        ctx.fillRect(bestRect.x, bestRect.y - 30, textWidth + 20, 30);

        // 3. ตัวหนังสือ
        ctx.fillStyle = "#d8b4fe";
        ctx.font = "bold 16px sans-serif";
        ctx.fillText(text, bestRect.x + 10, bestRect.y - 10);
      }

      src.delete();
      gray.delete();
      faces.delete();

      requestAnimationFrame(loop);
    } catch (e: any) {
      console.error(e);
    }
  }

  // Init
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
  }, []);

  // --- UI SECTION ---
  return (
    // ใช้สี Theme Purple (Background Dark)
    <main className="min-h-screen w-full bg-[#0f0720] text-[#f3e8ff] flex flex-col items-center justify-center p-4 md:p-8 font-sans">
      
      {/* Header */}
      <div className="w-full max-w-5xl mb-6 flex items-center justify-between">
         <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#d8b4fe] to-[#9333ea]">
              Face Emotion AI
            </h1>
            <p className="text-sm text-[#e9d5ff]/60 mt-1">Real-time detection via ONNX Runtime & OpenCV</p>
         </div>
         
         {/* Status Badge */}
         <div className={`px-4 py-2 rounded-full text-sm font-medium border ${
            isLoading ? "bg-yellow-500/10 border-yellow-500/50 text-yellow-200" :
            isStreaming ? "bg-green-500/10 border-green-500/50 text-green-300" :
            "bg-[#2e1065] border-[#9333ea]/50 text-[#d8b4fe]"
         }`}>
            ● {status}
         </div>
      </div>

      {/* Main Grid Layout */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
         
         {/* Left: Camera Feed (Hero Section) */}
         <div className="lg:col-span-2 w-full">
            <div className="relative aspect-video bg-black/40 rounded-2xl overflow-hidden border border-[#2e1065] shadow-[0_0_30px_rgba(147,51,234,0.15)]">
               <video ref={videoRef} className="hidden" playsInline />
               <canvas
                  ref={canvasRef}
                  className="w-full h-full object-contain"
               />
               
               {/* Overlay when not streaming */}
               {!isStreaming && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0720]/80 backdrop-blur-sm z-10">
                     <p className="text-[#e9d5ff]/50 mb-4">กล้องยังไม่ทำงาน</p>
                     <button 
                        onClick={startCamera}
                        disabled={isLoading}
                        className="px-8 py-3 rounded-xl bg-[#9333ea] text-white font-bold shadow-lg shadow-purple-900/50 hover:bg-[#a855f7] hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {isLoading ? "กำลังโหลด..." : "เปิดกล้อง (Start Camera)"}
                     </button>
                  </div>
               )}
            </div>
         </div>

         {/* Right: Dashboard Panel */}
         <div className="w-full flex flex-col gap-4">
            
            {/* Emotion Card */}
            <div className="flex-1 bg-[#1e1b4b]/50 backdrop-blur-md border border-[#2e1065] rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#d8b4fe] to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
               
               <h3 className="text-[#e9d5ff]/60 text-sm uppercase tracking-widest mb-2">Detected Emotion</h3>
               <div className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-[#d8b4fe] py-2">
                  {emotion}
               </div>
               
               {/* Confidence Bar */}
               <div className="w-full mt-6">
                  <div className="flex justify-between text-xs text-[#e9d5ff]/50 mb-1">
                     <span>Confidence</span>
                     <span>{(conf * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-3 bg-[#0f0720] rounded-full overflow-hidden border border-[#2e1065]">
                     <div 
                        className="h-full bg-[#9333ea] shadow-[0_0_10px_#9333ea]" 
                        style={{ width: `${conf * 100}%`, transition: 'width 0.3s ease' }}
                     ></div>
                  </div>
               </div>
            </div>

            {/* Instruction / Info */}
            <div className="bg-[#1e1b4b]/30 border border-[#2e1065] rounded-xl p-4 text-xs text-[#e9d5ff]/40">
               <p>
                  * ระบบทำงานบน Browser ของคุณ 100% (Client-Side) <br/>
                  * ไม่มีการส่งข้อมูลภาพออกไปยัง Server ภายนอก
               </p>
            </div>

         </div>
      </div>

    </main>
  );
}