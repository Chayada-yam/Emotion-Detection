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

  // --- 1. LOGIC SECTION (เหมือนเดิมทุกอย่าง) ---

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
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus("กำลังทำงาน...");
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
      
      // วาดภาพจากวิดีโอลง Canvas (นี่คือภาพที่เราเห็น)
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
      }

      if (bestRect) {
        // Crop & Predict
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

        // --- DRAW UI ON CANVAS (วาดทับลงไปบนภาพเลย) ---
        
        // 1. กรอบสีม่วงรอบใบหน้า
        ctx.strokeStyle = "#d8b4fe"; // Neon Purple
        ctx.lineWidth = 4;
        ctx.shadowColor = "#9333ea"; // Glow effect
        ctx.shadowBlur = 10;
        ctx.strokeRect(bestRect.x, bestRect.y, bestRect.width, bestRect.height);
        ctx.shadowBlur = 0; // Reset shadow

        // 2. แถบชื่อ Emotion ด้านบนหัว
        const text = `${detectedEmotion} ${(confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 24px sans-serif";
        const textWidth = ctx.measureText(text).width;
        
        // Background ของตัวหนังสือ
        ctx.fillStyle = "rgba(147, 51, 234, 0.9)"; // Purple Background
        ctx.fillRect(
          bestRect.x + (bestRect.width/2) - (textWidth/2) - 10, 
          bestRect.y - 40, 
          textWidth + 20, 
          34
        );

        // ตัวหนังสือสีขาว
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          text, 
          bestRect.x + (bestRect.width/2) - (textWidth/2), 
          bestRect.y - 15
        );
      } else {
        // ถ้าไม่เจอหน้า ให้ reset
        setEmotion("-");
        setConf(0);
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

  // --- 2. UI SECTION (Single View) ---
  return (
    <main className="min-h-screen w-full bg-[#0f0720] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-900/20 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Main Container */}
      <div className="relative w-full max-w-3xl z-10 flex flex-col gap-4 items-center">
         
         {/* Title */}
         <div className="text-center space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-[#f3e8ff] tracking-tight">
               AI Emotion Camera
            </h1>
            <p className="text-sm text-[#e9d5ff]/60">
               Status: <span className={isStreaming ? "text-green-400" : "text-yellow-400"}>{status}</span>
            </p>
         </div>

         {/* CAMERA FRAME (Single View) */}
         <div className="relative w-full aspect-video bg-black/50 rounded-2xl overflow-hidden border-2 border-[#2e1065] shadow-2xl shadow-purple-900/20 group">
            
            {/* 1. Hidden Video Source (ห้ามลบ แต่ซ่อนไว้) */}
            <video ref={videoRef} className="hidden" playsInline />
            
            {/* 2. Main Display Canvas (แสดงผลทุกอย่างที่นี่) */}
            <canvas
               ref={canvasRef}
               className="w-full h-full object-contain block"
            />

            {/* 3. Overlay ปุ่ม Start (จะหายไปเมื่อเริ่มสตรีม) */}
            {!isStreaming && (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0f0720]/80 backdrop-blur-sm transition-all duration-500">
                  <button 
                     onClick={startCamera}
                     disabled={isLoading}
                     className="px-8 py-4 rounded-full bg-[#9333ea] text-white font-bold text-lg shadow-[0_0_20px_rgba(147,51,234,0.5)] hover:bg-[#a855f7] hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                     {isLoading ? (
                        <>
                           <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                           กำลังโหลดโมเดล...
                        </>
                     ) : (
                        "📸 เปิดกล้อง (Start)"
                     )}
                  </button>
               </div>
            )}

            {/* 4. Overlay ผลลัพธ์ (จะแสดงเมื่อเริ่มสตรีม) */}
            {isStreaming && (
               <div className="absolute top-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
                  {/* แสดงค่าความมั่นใจเป็น Bar เล็กๆ มุมจอ */}
                  <div className="bg-black/40 backdrop-blur-md p-2 rounded-lg border border-white/10">
                     <div className="text-xs text-white/70 mb-1 text-right">Confidence</div>
                     <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div 
                           className="h-full bg-[#d8b4fe] transition-all duration-300" 
                           style={{ width: `${conf * 100}%` }}
                        ></div>
                     </div>
                  </div>
               </div>
            )}
         </div>

         {/* Footer Info */}
         <p className="text-xs text-[#e9d5ff]/30 text-center max-w-md">
            ระบบทำงานบนเครื่องของคุณ (Client-Side) 100% ไม่มีการส่งข้อมูลออกสู่ภายนอก
         </p>

      </div>
    </main>
  );
}