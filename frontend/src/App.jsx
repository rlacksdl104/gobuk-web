import { useEffect, useMemo, useRef, useState } from 'react';
import { useMediapipeLoader } from './hooks/useMediapipeLoader';

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
  const leftEar = landmarks[7];
  const rightEar = landmarks[8];

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

  return { score, status, reason, shoulderAngle, headForward, headDownness };
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

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('좋음');
  const [reason, setReason] = useState('웹캠을 켜고 자세를 측정합니다.');
  const [history, setHistory] = useState([]);
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const { loaded: mediapipeLoaded, error: mediapipeError } = useMediapipeLoader();
  const notificationRef = useRef({ lastNotifiedAt: 0 });

  const todayStats = useMemo(() => buildTodayStats(history, 8), [history]);

  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;
    if (!videoElement || !canvasElement) return;

    const canvasCtx = canvasElement.getContext('2d');
    let drawConnectorsFn = null;
    let drawLandmarksFn = null;
    let poseConnections = null;
    let cameraInstance = null;
    let poseInstance = null;
    let isMounted = true;

    const onResults = (results) => {
      if (!isMounted) return;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

      if (results.poseLandmarks && drawConnectorsFn && drawLandmarksFn && poseConnections) {
        drawConnectorsFn(canvasCtx, results.poseLandmarks, poseConnections, {
          color: '#38bdf8',
          lineWidth: 2
        });
        drawLandmarksFn(canvasCtx, results.poseLandmarks, {
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

          const trimmed = next.slice(-48);
          return trimmed;
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
      const Camera = window.Camera;
      const Pose = window.Pose;
      const POSE_CONNECTIONS = window.POSE_CONNECTIONS;
      const drawConnectors = window.drawConnectors;
      const drawLandmarks = window.drawLandmarks;

      if (!mediapipeLoaded || !Camera || !Pose || !POSE_CONNECTIONS || !drawConnectors || !drawLandmarks) {
        console.error('Mediapipe script not loaded yet.');
        return;
      }

      drawConnectorsFn = drawConnectors;
      drawLandmarksFn = drawLandmarks;
      poseConnections = POSE_CONNECTIONS;

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

    if (mediapipeLoaded) {
      initPose();
    }

    return () => {
      isMounted = false;
      cameraInstance?.stop();
      poseInstance?.close();
    };
  }, [mediapipeLoaded]);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    setNotificationSupported(supported);
    if (!supported) return;
    setNotificationPermission(Notification.permission);
  }, []);

  const requestNotificationPermission = async () => {
    if (!notificationSupported) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  useEffect(() => {
    if (!notificationSupported) return;
    if (notificationPermission !== 'granted') return;
    if (score > 80) return;

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
        <header className="rounded-3xl bg-white/90 p-6 shadow-soft backdrop-blur-xl">
          <div className={`rounded-2xl px-5 py-4 text-lg font-semibold ${statusStyles[status]}`}>
            현재 자세 상태: {status}
          </div>
          <p className="mt-3 text-slate-600">Mediapipe를 이용한 어깨선 기반 거북목과 자세 점수 실시간 모니터링.</p>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">웹캠 자세 모니터</h1>
                <p className="mt-2 text-sm text-slate-500">왼쪽에서 실시간 영상을 확인하고 자세 점수를 확인하세요.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">실시간 점수</div>
                <div className="mt-2 text-5xl font-bold text-slate-900">{score}</div>
                <div className="mt-1 text-sm text-slate-500">{reason}</div>
                {mediapipeError && (
                  <div className="mt-2 rounded-2xl bg-rose-100 px-3 py-2 text-xs text-rose-800">
                    Mediapipe 로드 실패: {mediapipeError.message}
                  </div>
                )}                {notificationSupported && notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={requestNotificationPermission}
                    className="mt-3 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    알림 허용하기
                  </button>
                )}
                {notificationSupported && notificationPermission === 'denied' && (
                  <div className="mt-2 rounded-2xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
                    브라우저 알림이 차단되었습니다. 설정에서 알림을 허용해주세요.
                  </div>
                )}
                {notificationSupported && notificationPermission === 'granted' && (
                  <div className="mt-2 rounded-2xl bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
                    알림 권한이 허용되었습니다. 점수가 80 이하일 때 알림이 표시됩니다.
                  </div>
                )}              </div>
            </div>

            <div className="relative mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950/5">
              <video ref={videoRef} className="hidden" playsInline muted />
              <canvas ref={canvasRef} width={640} height={480} className="h-full w-full bg-slate-950/5" />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">오늘 자세 통계</h2>
                <p className="mt-1 text-sm text-slate-500">시간별 평균 점수와 자세 흐름을 확인하세요.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm text-slate-500">평균 점수</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900">{Math.round(history.reduce((acc, entry) => acc + entry.score, 0) / Math.max(history.length, 1)) || 0}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500">최고</p>
                  <p className="mt-1 text-xl font-semibold text-emerald-600">{Math.max(...history.map((item) => item.score), 0)}</p>
                </div>
              </div>

              <div className="rounded-3xl bg-slate-950/5 p-4">
                <div className="flex items-end gap-3 h-56">
                  {todayStats.map((item) => (
                    <div key={item.label} className="flex h-full flex-col items-center gap-2">
                      <div className="h-full w-10 flex items-end">
                        <div
                          className="w-full rounded-full bg-gradient-to-t from-cyan-500 to-sky-300"
                          style={{ height: `${(item.value / chartMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-500">{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3 text-center text-xs text-slate-500">
                  {todayStats.map((item) => (
                    <div key={item.label} className="rounded-2xl bg-white/80 px-2 py-3 shadow-sm">
                      <div className="font-semibold text-slate-900">{item.value}</div>
                      <div className="mt-1">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
