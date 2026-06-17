'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const formatTime = (date) => {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const computePostureScore = (landmarks) => {
  if (!landmarks || landmarks.length === 0) {
    return { score: 0, status: '위험', reason: '랜드마크를 찾을 수 없음' };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const nose = landmarks[0];

  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };

  const shoulderDx = rightShoulder.x - leftShoulder.x;
  const shoulderDy = rightShoulder.y - leftShoulder.y;
  const slope = shoulderDy / (shoulderDx || 0.0001);
  const shoulderAngle = Math.atan(Math.abs(slope)) * (180 / Math.PI);

  const shoulderWidth = Math.hypot(shoulderDx, shoulderDy);
  const noseOffset = nose.x - shoulderMid.x;
  const headForward = Math.min(1, Math.max(0, noseOffset / (shoulderWidth + 0.0001)) * 1.5);
  const headDownness = Math.min(1, Math.max(0, (nose.y - shoulderMid.y) / (shoulderWidth + 0.0001)) * 1.8);

  const rawScore = 100 - Math.min(90, shoulderAngle * 1.7 + headForward * 75 + headDownness * 80);
  const score = Math.round(Math.max(0, Math.min(100, rawScore)));

  let status = '좋음';
  let reason = '어깨와 머리 정렬이 안정적입니다.';
  if (headDownness > 0.25 && score >= 85) {
    status = '경고';
    reason = '고개가 너무 숙여졌습니다. 목을 펴고 눈높이를 맞추세요.';
  } else if (score < 70) {
    status = '위험';
    reason = '어깨 기울기나 목 앞으로 나온 자세가 심합니다.';
  } else if (score < 85) {
    status = '경고';
    reason = '자세가 약간 흐트러졌습니다. 조정이 필요합니다.';
  }

  return { score, status, reason };
};

const statusStyles = {
  좋음: 'bg-emerald-500/90 text-white',
  경고: 'bg-amber-500/90 text-slate-950',
  위험: 'bg-rose-600/90 text-white'
};

const getIntervalStart = (date) => {
  const interval = new Date(date);
  interval.setSeconds(0, 0);
  const minute = interval.getMinutes();
  interval.setMinutes(Math.floor(minute / 10) * 10);
  return interval;
};

const formatIntervalLabel = (date) => {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}분`;
};

const buildTodayStats = (history, count = 8) => {
  const now = new Date();
  const currentInterval = getIntervalStart(now);
  return Array.from({ length: count }).map((_, index) => {
    const intervalStart = new Date(currentInterval.getTime() - (count - 1 - index) * 10 * 60 * 1000);
    const bucket = history.find((entry) => entry.interval.getTime() === intervalStart.getTime());
    const score = bucket ? bucket.score : 0;
    return {
      label: formatIntervalLabel(intervalStart),
      value: score,
      detail: `${formatIntervalLabel(intervalStart)} ${score}점`
    };
  });
};

export default function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('좋음');
  const [reason, setReason] = useState('웹캠을 켜고 자세를 측정합니다.');
  const [history, setHistory] = useState([]);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const [mediapipeLoaded, setMediapipeLoaded] = useState(false);
  const notificationRef = useRef({ lastNotifiedAt: 0 });

  const todayStats = useMemo(() => buildTodayStats(history, 8), [history]);

  // Load MediaPipe scripts from CDN
  useEffect(() => {
    const scripts = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
      'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js'
    ];

    let loaded = 0;
    const checkLoaded = () => {
      loaded++;
      if (loaded === scripts.length) {
        setMediapipeLoaded(true);
      }
    };

    scripts.forEach((src) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = checkLoaded;
      document.head.appendChild(script);
    });
  }, []);

  // Initialize Pose detection
  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!videoElement || !canvasElement || !mediapipeLoaded) return;

    const canvasCtx = canvasElement.getContext('2d');
    let cameraInstance = null;
    let poseInstance = null;
    let isMounted = true;

    const onResults = (results) => {
      if (!isMounted) return;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      if (results.poseLandmarks) {
        window.drawConnectors(canvasCtx, results.poseLandmarks, window.POSE_CONNECTIONS, {
          color: '#38bdf8',
          lineWidth: 2
        });
        window.drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#0f172a',
          lineWidth: 2,
          radius: 1.5
        });

        const posture = computePostureScore(results.poseLandmarks);
        setScore(posture.score);
        setStatus(posture.status);
        setReason(posture.reason);
        setHistory((prev) => {
          const now = new Date();
          const interval = getIntervalStart(now);
          const next = [...prev];
          const existingIndex = next.findIndex((entry) => entry.interval.getTime() === interval.getTime());

          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], score: posture.score };
          } else {
            next.push({ interval, score: posture.score });
          }

          return next.slice(-48);
        });

        const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];
        canvasCtx.strokeStyle = posture.status === '좋음' ? '#10b981' : posture.status === '경고' ? '#f59e0b' : '#ef4444';
        canvasCtx.lineWidth = 4;
        canvasCtx.beginPath();
        canvasCtx.moveTo(leftShoulder.x * canvasElement.width, leftShoulder.y * canvasElement.height);
        canvasCtx.lineTo(rightShoulder.x * canvasElement.width, rightShoulder.y * canvasElement.height);
        canvasCtx.stroke();
      }
      canvasCtx.restore();
    };

    const initPose = () => {
      const Pose = window.Pose;
      const Camera = window.Camera;

      if (!Pose || !Camera) {
        console.error('MediaPipe not loaded');
        return;
      }

      poseInstance = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
      });
      poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      poseInstance.onResults(onResults);

      cameraInstance = new Camera(videoElement, {
        onFrame: async () => await poseInstance.send({ image: videoElement }),
        width: 640,
        height: 480
      });
      cameraInstance.start();
    };

    initPose();

    return () => {
      isMounted = false;
      cameraInstance?.stop();
      poseInstance?.close();
    };
  }, [mediapipeLoaded]);

  // Notification setup
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    setNotificationSupported(supported);
    if (supported) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Notification trigger
  useEffect(() => {
    if (!notificationSupported || notificationPermission !== 'granted' || score > 80) return;

    const now = Date.now();
    if (now - notificationRef.current.lastNotifiedAt < 5 * 60 * 1000) return;

    new Notification('자세 주의', {
      body: `현재 점수 ${score}. 목과 어깨를 바로 펴주세요.`,
      badge: '/favicon.ico'
    });
    notificationRef.current.lastNotifiedAt = now;
  }, [score, notificationPermission, notificationSupported]);

  const chartMax = 100;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white/90 p-6 shadow-lg backdrop-blur-xl">
          <div className={`rounded-2xl px-5 py-4 text-lg font-semibold ${statusStyles[status]}`}>
            현재 자세 상태: {status}
          </div>
          <p className="mt-3 text-slate-600">MediaPipe를 이용한 어깨선 기반 거북목과 자세 점수 실시간 모니터링.</p>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-3xl bg-white p-6 shadow-lg">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">웹캠 자세 모니터</h1>
                <p className="mt-2 text-sm text-slate-500">왼쪽에서 실시간 영상을 확인하고 자세 점수를 확인하세요.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">실시간 점수</div>
                <div className="mt-2 text-5xl font-bold text-slate-900">{score}</div>
                <div className="mt-1 text-sm text-slate-500">{reason}</div>
                {!mediapipeLoaded && (
                  <div className="mt-2 rounded-2xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
                    MediaPipe 로딩 중...
                  </div>
                )}
                {notificationSupported && notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const perm = await Notification.requestPermission();
                      setNotificationPermission(perm);
                    }}
                    className="mt-3 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    알림 허용하기
                  </button>
                )}
                {notificationSupported && notificationPermission === 'granted' && (
                  <div className="mt-2 rounded-2xl bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
                    알림이 활성화되었습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="relative mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950/5">
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas ref={canvasRef} width={640} height={480} className="h-full w-full bg-slate-950/5" />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-lg">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">오늘 자세 통계</h2>
              <p className="mt-1 text-sm text-slate-500">시간별 평균 점수</p>
            </div>

            <div className="mt-6 space-y-3">
              {todayStats.map((stat, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-12 text-right text-xs font-semibold text-slate-600">{stat.label}</span>
                  <div className="flex-1">
                    <div className="relative h-8 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                        style={{ width: `${(stat.value / chartMax) * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-slate-900">{stat.value}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
