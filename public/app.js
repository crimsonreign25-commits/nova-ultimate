const statusButton = document.getElementById('statusButton');
const systemName = document.getElementById('systemName');
const systemVersion = document.getElementById('systemVersion');
const groqStatus = document.getElementById('groqStatus');
const featureCount = document.getElementById('featureCount');
const systemBadge = document.getElementById('systemBadge');
const responseBox = document.getElementById('responseBox');
const predictionsBox = document.getElementById('predictions');
const scanResult = document.getElementById('scanResult');
const voiceStatus = document.getElementById('voiceStatus');
const activePersonaTitle = document.getElementById('activePersonaTitle');
const speakButton = document.getElementById('speakButton');
let activePersona = 'nova';
let latestResponse = '';

const fileInput = document.getElementById('fileInput');
const cameraButton = document.getElementById('cameraButton');
const clearAttachmentsButton = document.getElementById('clearAttachments');
const attachmentPreview = document.getElementById('attachmentPreview');
const cameraModal = document.getElementById('cameraModal');
const cameraPreview = document.getElementById('cameraPreview');
const cameraCanvas = document.getElementById('cameraCanvas');
const captureButton = document.getElementById('captureButton');
const closeCameraButton = document.getElementById('closeCamera');
const switchCameraButton = document.getElementById('switchCameraButton');
const cameraMessage = document.getElementById('cameraMessage');
const micButton = document.getElementById('micButton');
const liveVoiceButton = document.getElementById('liveVoiceButton');
const liveVoiceStatus = document.getElementById('liveVoiceStatus');
const liveVoiceIndicator = document.getElementById('liveVoiceButton');
const micStatus = document.getElementById('micStatus');
const messageInput = document.getElementById('messageInput');
let recognition = null;
let isListening = false;
let selectedAttachments = [];
let cameraStream = null;
let cameraFacingMode = 'environment';
let liveVoiceMode = false;
let isSpeaking = false;
let pendingLiveRequest = false;
const workspaceMode = document.getElementById('workspaceMode');
document.querySelectorAll('.rail-btn').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.rail-btn').forEach((item) => item.classList.toggle('active', item === button));
  });
});

function updateWorkspaceMode(mode) {
  if (workspaceMode) workspaceMode.textContent = mode;
}


function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAttachments() {
  attachmentPreview.innerHTML = '';
  clearAttachmentsButton.hidden = selectedAttachments.length === 0;
  selectedAttachments.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'attachment-card';
    if (item.type.startsWith('image/') && item.previewUrl) {
      const img = document.createElement('img');
      img.src = item.previewUrl;
      img.alt = item.name;
      card.appendChild(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'attachment-file-icon';
      icon.textContent = '📄';
      card.appendChild(icon);
    }
    const meta = document.createElement('div');
    meta.className = 'attachment-meta';
    const name = document.createElement('span');
    name.className = 'attachment-name';
    name.textContent = item.name;
    const size = document.createElement('span');
    size.className = 'attachment-size';
    size.textContent = formatFileSize(item.size);
    meta.append(name, size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attachment-remove';
    remove.textContent = '✕';
    remove.title = `Remove ${item.name}`;
    remove.addEventListener('click', () => removeAttachment(index));
    card.append(meta, remove);
    attachmentPreview.appendChild(card);
  });
}

function removeAttachment(index) {
  const [item] = selectedAttachments.splice(index, 1);
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  renderAttachments();
}

function addFiles(files) {
  const incoming = Array.from(files);
  incoming.forEach((file) => {
    if (selectedAttachments.length >= 5) return;
    if (file.size > 8 * 1024 * 1024) return;
    if (selectedAttachments.some((item) => item.name === file.name && item.size === file.size)) return;
    selectedAttachments.push({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    });
  });
  renderAttachments();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

async function buildAttachmentPayload() {
  const payload = [];
  for (const item of selectedAttachments.slice(0, 5)) {
    const supported = item.type.startsWith('image/') || ['text/plain', 'text/csv', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(item.type) || /\.(pdf|docx|xlsx|pptx|txt|csv)$/i.test(item.name);
    if (!supported) {
      payload.push({ name: item.name, type: item.type, unsupported: true });
      continue;
    }
    const data = await fileToDataUrl(item.file);
    payload.push({ name: item.name, type: item.type, data });
  }
  const totalSize = payload.reduce((sum, item) => sum + (item.data ? item.data.length : 0), 0);
  if (totalSize > 22 * 1024 * 1024) {
    throw new Error('Attachments are too large together. Please remove one or more files and try again.');
  }
  return payload;
}

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  updateWorkspaceMode('ATTACHMENTS');
  fileInput.value = '';
});

function setupMicrophone() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.title = 'Voice input is not supported by this browser.';
    micStatus.textContent = 'Voice input is not supported by this browser.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('listening');
    micButton.setAttribute('aria-pressed', 'true');
    micButton.innerHTML = '⏹️ Stop <span>Listening...</span>';
    micStatus.textContent = 'Listening... speak clearly to NOVA.';
    updateWorkspaceMode('VOICE INPUT');
  };

  recognition.onresult = (event) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    if (finalText.trim()) {
      const current = messageInput.value.trim();
      messageInput.value = current ? `${current} ${finalText.trim()}` : finalText.trim();
      if (liveVoiceMode) {
        pendingLiveRequest = true;
        submitAssistantMessage(true);
      }
    }
    if (interimText.trim()) micStatus.textContent = `Hearing: ${interimText.trim()}`;
  };

  recognition.onerror = (event) => {
    console.error('Microphone error:', event.error);
    const messages = {
      'not-allowed': 'Microphone permission was denied.',
      'audio-capture': 'No microphone was found.',
      'no-speech': 'No speech was detected.'
    };
    micStatus.textContent = messages[event.error] || 'Microphone input failed.';
  };

  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('listening');
    micButton.setAttribute('aria-pressed', 'false');
    micButton.innerHTML = '🎤 Mic <span>Speak to NOVA</span>';
    if (!micStatus.textContent.startsWith('Microphone permission') && !micStatus.textContent.startsWith('No microphone')) {
      micStatus.textContent = liveVoiceMode ? 'Live Voice is waiting for NOVA to respond.' : 'Microphone ready.';
      if (!liveVoiceMode) updateWorkspaceMode('TEXT MODE');
    }
  };

  micButton.addEventListener('click', () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      console.error(error);
      micStatus.textContent = 'Microphone could not start. Try again.';
    }
  });
}

setupMicrophone();

clearAttachmentsButton.addEventListener('click', () => {
  selectedAttachments.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  selectedAttachments = [];
  renderAttachments();
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage.textContent = 'Camera access is not supported by this browser.';
    return;
  }
  try {
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    cameraPreview.srcObject = cameraStream;
    cameraMessage.textContent = 'Camera ready. Capture a photo to attach it to NOVA.';
  } catch (error) {
    console.error(error);
    cameraMessage.textContent = 'Camera permission was denied or the camera is unavailable.';
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraPreview.srcObject = null;
}

cameraButton.addEventListener('click', async () => {
  cameraModal.hidden = false;
  updateWorkspaceMode('CAMERA');
  await startCamera();
});

closeCameraButton.addEventListener('click', () => {
  stopCamera();
  cameraModal.hidden = true;
});

switchCameraButton.addEventListener('click', async () => {
  cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});

captureButton.addEventListener('click', () => {
  if (!cameraStream) return;
  const width = cameraPreview.videoWidth || 1280;
  const height = cameraPreview.videoHeight || 720;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const context = cameraCanvas.getContext('2d');
  context.drawImage(cameraPreview, 0, 0, width, height);
  cameraCanvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], `NOVA-Capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
    addFiles([file]);
    cameraMessage.textContent = 'Photo captured and attached.';
  }, 'image/jpeg', 0.92);
});

cameraModal.addEventListener('click', (event) => {
  if (event.target === cameraModal) {
    stopCamera();
    cameraModal.hidden = true;
  }
});

window.addEventListener('beforeunload', () => {
  selectedAttachments.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  stopCamera();
});

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    systemName.textContent = data.name || 'NOVA Ultimate';
    systemVersion.textContent = data.version || '1.0.0';
    featureCount.textContent = Array.isArray(data.features) ? data.features.length : '0';
    groqStatus.textContent = data.groqConfigured ? 'Configured' : 'Missing';
    voiceStatus.textContent = data.voiceConfigured ? 'ElevenLabs ready' : 'ElevenLabs not configured';
    voiceStatus.classList.toggle('ready', Boolean(data.voiceConfigured));
    speakButton.disabled = !data.voiceConfigured || !latestResponse;
    systemBadge.textContent = data.status === 'operational' ? 'Operational' : 'Offline';
    systemBadge.style.background = data.status === 'operational' ? 'rgba(34,197,94,0.12)' : 'rgba(248,113,113,0.12)';
    systemBadge.style.color = data.status === 'operational' ? '#86efac' : '#fca5a5';
    if (!latestResponse) {
      responseBox.textContent = 'NOVA is monitoring the system and ready to assist.';
    }
  } catch (error) {
    responseBox.textContent = 'Unable to load system status.';
    console.error(error);
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function submitAssistantMessage(fromLiveVoice = false) {
  const message = messageInput.value.trim();
  if (!message || (fromLiveVoice && pendingLiveRequest === false)) return;

  pendingLiveRequest = false;
  responseBox.textContent = liveVoiceMode ? 'NOVA is thinking...' : 'Thinking...';
  try {
    const attachments = await buildAttachmentPayload();
    const attachmentNote = selectedAttachments.length
      ? `\n\nThe user attached ${selectedAttachments.length} file(s): ${selectedAttachments.map((item) => item.name).join(', ')}.`
      : '';
    const unsupported = attachments.filter((item) => item.unsupported);
    const data = await postJson('/assist', {
      message: message + attachmentNote,
      user_id: 'mobile-user',
      persona: activePersona,
      attachments
    });
    latestResponse = data.response || '';
    const unsupportedNote = unsupported.length
      ? `\n\nNote: ${unsupported.map((item) => item.name).join(', ')} is attached but NOVA could not extract readable content from it.`
      : '';
    responseBox.textContent = `${latestResponse || 'No response received.'}${unsupportedNote}`;
    speakButton.disabled = !latestResponse;

    if (liveVoiceMode && latestResponse) {
      await speakText(latestResponse, true);
    }
  } catch (error) {
    responseBox.textContent = 'There was an issue reaching NOVA.';
    console.error(error);
    if (liveVoiceMode) {
      liveVoiceStatus.textContent = `Live Voice error: ${error.message || 'connection failed'}`;
    }
  }
}

document.getElementById('assistantForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await submitAssistantMessage(false);
});

function startListening() {
  if (!recognition || isListening || isSpeaking || !liveVoiceMode) return;
  try {
    recognition.start();
    liveVoiceStatus.textContent = 'Listening... speak naturally to NOVA.';
  } catch (error) {
    console.error(error);
  }
}

function stopListening() {
  if (recognition && isListening) recognition.stop();
}

async function speakText(text, live = false) {
  if (!text) return;
  isSpeaking = true;
  if (live) liveVoiceStatus.textContent = 'NOVA is speaking...';
  const original = speakButton.textContent;
  speakButton.disabled = true;
  speakButton.textContent = '🔊 Speaking...';
  try {
    const response = await fetch('/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, persona: activePersona })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Voice request failed');
    }
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('Audio playback failed.'));
      audio.play().catch(reject);
    });
    URL.revokeObjectURL(audioUrl);
    if (live && liveVoiceMode) {
      liveVoiceStatus.textContent = 'NOVA finished speaking. Listening again...';
    }
  } finally {
    isSpeaking = false;
    speakButton.disabled = !latestResponse;
    speakButton.textContent = original;
  }
  if (live && liveVoiceMode) {
    setTimeout(startListening, 250);
  }
}

liveVoiceButton.addEventListener('click', () => {
  if (!recognition) {
    liveVoiceStatus.textContent = 'Live Voice is not supported by this browser.';
    return;
  }
  liveVoiceMode = !liveVoiceMode;
  updateWorkspaceMode(liveVoiceMode ? 'LIVE VOICE' : 'TEXT MODE');
  liveVoiceButton.classList.toggle('active', liveVoiceMode);
  liveVoiceButton.setAttribute('aria-pressed', String(liveVoiceMode));
  liveVoiceButton.innerHTML = liveVoiceMode
    ? '🟢 Live Voice <span>Conversation on</span>'
    : '🔴 Live Voice <span>Conversation off</span>';

  if (liveVoiceMode) {
    liveVoiceStatus.textContent = 'Live Voice enabled. Listening...';
    startListening();
  } else {
    stopListening();
    liveVoiceStatus.textContent = 'Live Voice is off.';
  }
});

document.getElementById('predictButton').addEventListener('click', async () => {
  const message = document.getElementById('messageInput').value.trim() || 'create a new app';
  try {
    const data = await postJson('/predict', { user_id: 'mobile-user', message });
    predictionsBox.innerHTML = (data.suggestions || []).map((s) => `
      <div class="prediction-pill">
        <span class="intent">${s.intent}</span>
        <span class="confidence">${(s.confidence * 100).toFixed(0)}%</span>
      </div>
    `).join('') || 'No suggestions available.';
  } catch (error) {
    predictionsBox.textContent = 'Unable to load predictions.';
    console.error(error);
  }
});

document.querySelectorAll('.persona-btn').forEach((button) => {
  button.addEventListener('click', () => {
    activePersona = button.dataset.persona;
    document.querySelectorAll('.persona-btn').forEach((item) => item.classList.toggle('active', item === button));
    activePersonaTitle.textContent = activePersona.toUpperCase();
  });
});

speakButton.addEventListener('click', async () => {
  if (!latestResponse || speakButton.disabled) return;
  try {
    await speakText(latestResponse, false);
  } catch (error) {
    console.error(error);
    voiceStatus.textContent = error.message;
  }
});

document.getElementById('scanForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = document.getElementById('scanInput').value.trim();
  if (!url) return;
  try {
    const data = await postJson('/scan-url', { url });
    scanResult.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    scanResult.textContent = 'Scan failed.';
    console.error(error);
  }
});

statusButton.addEventListener('click', loadStatus);
loadStatus();
