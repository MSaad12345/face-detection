    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const ctx = overlay.getContext('2d');
    const status = document.getElementById('status');
    const objectResults = document.getElementById('objectResults');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    let stream = null;
    let detectionInterval = null;
    let cocoModel = null;
    let lastDetectionResult = '';
    let currentFaceBoxes = [];

    async function loadModels() {
      const modelUrl = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
      await faceapi.nets.ageGenderNet.loadFromUri(modelUrl);
      await faceapi.nets.faceExpressionNet.loadFromUri(modelUrl);
      await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl);
      cocoModel = await cocoSsd.load();
    }

    async function startVideo() {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video.srcObject = stream;
      await video.play();
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }

    function startDetection() {
      detectionInterval = setInterval(async () => {
        overlay.width = video.videoWidth;
        overlay.height = video.videoHeight;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        currentFaceBoxes = [];

        // Face detection + landmarks + age/gender/expressions
        const faces = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withAgeAndGender()
          .withFaceExpressions();

        // Object detection
        const objects = await cocoModel.detect(video);

        let faceText = '';
        faces.forEach(d => {
          const { detection, age, gender, expressions, landmarks } = d;
          const box = detection.box;
          // Draw bounding box + label
          const topExp = Object.entries(expressions).sort((a,b)=>b[1]-a[1])[0][0];
          const label = `${gender} (${Math.round(age)} yrs), ${topExp}`;
          new faceapi.draw.DrawBox(box, { label }).draw(overlay);
          faceText += `Face: ${label}\n`;

          // Draw the facial landmarks (mesh)
          faceapi.draw.drawFaceLandmarks(overlay, landmarks);

          // Save for click interaction
          currentFaceBoxes.push(box);
        });

        let objText = '';
        objects.forEach(o => {
          const [x,y,w,h] = o.bbox;
          ctx.beginPath();
          ctx.rect(x,y,w,h);
          ctx.strokeStyle = 'lime';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = 'lime';
          ctx.fillText(`${o.class} (${Math.round(o.score*100)}%)`, x, y>10? y-5:10);
          objText += `Object: ${o.class} (${Math.round(o.score*100)}%)\n`;
        });

        const summary = faceText + objText;
        objectResults.textContent = summary;
        lastDetectionResult = `[${new Date().toLocaleTimeString()}]\n${summary}`;
        status.textContent = `${faces.length} face(s), ${objects.length} object(s) detected`;
      }, 1000);
    }

    function stopDetection() {
      clearInterval(detectionInterval);
      detectionInterval = null;
      status.textContent = 'Detection stopped';
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      if (lastDetectionResult.trim()) {
        if (confirm('Do you want to download the last detection result?')) {
          const blob = new Blob([lastDetectionResult], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'last-detection-result.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      }
      lastDetectionResult = '';
      currentFaceBoxes = [];
    }

    // Canvas click → highlight and alert on face
    overlay.addEventListener('click', e => {
      const rect = overlay.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (let box of currentFaceBoxes) {
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
          // highlight in red
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
          alert('Face clicked!');
          break;
        }
      }
    });

    window.addEventListener('load', async () => {
      await loadModels();
      status.textContent = 'Models loaded. Click “Start Detection” to begin.';
      startBtn.disabled = false;
    });

    startBtn.addEventListener('click', async () => {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      status.textContent = 'Starting video…';
      await startVideo();
      startDetection();
    });

    stopBtn.addEventListener('click', () => {
      stopBtn.disabled = true;
      startBtn.disabled = false;
      stopDetection();
    });
