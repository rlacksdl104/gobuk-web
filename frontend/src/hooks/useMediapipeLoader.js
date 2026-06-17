import { useEffect, useState } from 'react';

const CDN_URLS = {
  cameraUtils: 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
  pose: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js',
  drawingUtils: 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js'
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (error) => reject(new Error(`Failed to load script ${src}: ${error.message}`));
    document.head.appendChild(script);
  });
}

export function useMediapipeLoader() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      loadScript(CDN_URLS.cameraUtils),
      loadScript(CDN_URLS.pose),
      loadScript(CDN_URLS.drawingUtils)
    ])
      .then(() => {
        if (mounted) {
          setLoaded(true);
        }
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { loaded, error };
}
