

def background_matrix_sync():
    global MATRIX_PAGE_ACTIVE
    while True:
        try:
            if MATRIX_PAGE_ACTIVE:
                matrix_state = [[0 for _ in range(4)] for _ in range(10)]
                for row in range(10):
                    for col in range(4):
                        if row < 8:
                            state = get_matrix_assignment(mixer, 0x00, row, col)
                        else:
                            state = get_matrix_assignment(mixer, 0x01, row - 8, col)
                        matrix_state[row][col] = 1 if state else 0
                        time.sleep(0.02)
                with open('matrix_state.json', 'w') as f:
                    json.dump(matrix_state, f)
        except Exception as e:
            print("Background sync error:", e)
        time.sleep(2)
    


from flask import Flask, render_template_string, request, redirect
import threading
import webview
import json
import os
import socket
import time
matrix_watchers = 0

from datetime import datetime

app = Flask(__name__)

MATRIX_PAGE_ACTIVE = False

# ====== Config ======
NUM_MONO = 8
NUM_STEREO = 2
NUM_OUTPUT = 4
STATE_FILE = 'm864d_state.json'
CONFIG_FILE = 'config.json'

# ====== TCP Command Library ======

class M864DConnection:
    def __init__(self, ip='192.168.1.100', port=3000):
        self.ip = ip
        self.port = port
        self.socket = None
        self.lock = threading.Lock()
        self.keepalive_thread = None
        self.last_action_time = time.time()
        self.monitor_thread = threading.Thread(target=self.monitor_connection, daemon=True)
        self.monitor_thread.start()


    def connect(self):
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        print(f"Attempting connection to {self.ip}:{self.port}")
        try:
            self.socket = socket.create_connection((self.ip, self.port), timeout=5)
            ack = self.socket.recv(3)
            print(f"Raw response from M-864D: {ack.hex()}")
            if ack == bytes([0xDF, 0x01, 0x01]):
                print("✅ M-864D handshake received!")
                self.keepalive_thread = threading.Thread(target=self.keepalive_loop, daemon=True)
                self.keepalive_thread.start()
                return True
            else:
                print("❌ Unexpected handshake.")
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            self.socket = None
        return False

    def send(self, data):
        with self.lock:
            try:
                if self.socket:
                    self.socket.sendall(data)
                    self.last_action_time = time.time()
                    print("📤 Sent:", data.hex())
            except Exception as e:
                print("❌ Send failed:", e)

    def keepalive_loop(self):
        while True:
            try:
                self.send(b'\xFF')
                time.sleep(9)
            except:
                print("⚠️ Keepalive loop ended.")
                break


    def monitor_connection(self):
        while True:
            time.sleep(5)
            if self.socket and time.time() - self.last_action_time > 62:
                print("⏱️ Timeout reached. Reconnecting...")
                with self.lock:
                    try:
                        if self.socket:
                            self.socket.close()
                    except:
                        pass
                    self.socket = None
                    self.connect()
def close(self):
        with self.lock:
            if self.socket:
                try:
                    self.socket.close()
                except:
                    pass
                self.socket = None



def send_matrix_assignment(conn, source_attr, source_num, bus_num, state):
    # 94H, 04H, <Source Channel Attribute>, <Source Channel Number>, <Bus Channel Number>, <ON/OFF>
    cmd = bytes([0x94, 0x04, source_attr, source_num, bus_num, 0x01 if state else 0x00])
    conn.send(cmd)


def send_preset_load(conn, preset_num):
    cmd = bytes([0xF1, 0x02, 0x00, preset_num])
    conn.send(cmd)

def send_preset_store(conn, preset_num):
    now = datetime.now()
    cmd = bytes([
        0xF3, 0x08, 0x00, preset_num,
        now.year - 2000,
        now.month,
        now.day,
        now.hour,
        now.minute,
        now.second
    ])
    conn.send(cmd)



def get_matrix_assignment(conn, source_attr, source_num, bus_num):
    try:
        cmd = bytes([0xF0, 0x04, 0x14, source_attr, source_num, bus_num])
        conn.send(cmd)
        start = time.time()
        while time.time() - start < 1.0:
            try:
                conn.socket.settimeout(0.5)
                data = conn.socket.recv(1024)
                if data:
                    print(f"RESP [{source_attr},{source_num}->{bus_num}]:", data.hex())
                for i in range(len(data) - 5):
                    if data[i] == 0x94 and data[i+1] == 0x04 and data[i+2] == source_attr and data[i+3] == source_num and data[i+4] == bus_num:
                        return data[i+5] == 1
            except socket.timeout:
                pass
            except Exception as e:
                print("Error reading matrix:", e)
            time.sleep(0.01)
    except Exception as e:
        print("Matrix query failed:", e)
    return False


def send_channel_onoff(conn, group, index, state):
    group_byte = {'mono': 0x00, 'stereo': 0x01, 'output': 0x02}[group]
    if group == 'stereo':
        cmd = bytes([0x92, 0x03, 0x01, index, 0x00 if state else 0x01])
    else:
        cmd = bytes([0x92, 0x03, group_byte, index, 0x01 if state else 0x00])
    conn.send(cmd)

# ====== Load/Save State and Config ======
def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    return { 'mono': [0]*NUM_MONO, 'stereo': [0]*NUM_STEREO, 'output': [0]*NUM_OUTPUT }

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f)

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return { 'ip': '192.168.1.100' }

def save_config(cfg):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(cfg, f)

# ====== Init State and Connection ======
state = load_state()
config = load_config()
mixer = M864DConnection(ip=config['ip'])
mixer.connect()

# ====== Main Control Page ======


threading.Thread(target=background_matrix_sync, daemon=True).start()

@app.route('/', methods=['GET', 'POST'])
def index():
    global MATRIX_PAGE_ACTIVE
    MATRIX_PAGE_ACTIVE = False
    global state
    message = ""
    
    if request.method == 'POST':
        if 'set_preset' in request.form:
            print("Set preset", request.form['set_preset'])
        elif 'load_preset' in request.form:
            print("Load preset", request.form['load_preset'])
        elif 'row' in request.form and 'col' in request.form:
            row = int(request.form.get('row'))
            col = int(request.form.get('col'))
            matrix_state[row][col] = 0 if matrix_state[row][col] == 1 else 1

            # Save updated matrix state
            with open(matrix_file, 'w') as f:
                json.dump(matrix_state, f)

            # Send matrix command
            if row < 8:
                send_matrix_assignment(mixer, 0x00, row, col, matrix_state[row][col])  # Mono
            else:
                send_matrix_assignment(mixer, 0x01, row - 8, col, matrix_state[row][col])  # Stereo

    return render_template_string("""<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script>window.INIT_STATE = {{ state | tojson }};</script><title>M-864D Control</title>
<style>
.mute-button.active {
    background: #228B22 !important;
}

body { background: #111; color: #eee; font-family: Arial; padding: 20px; }
.section { background: #222; margin: 20px auto; padding: 20px; border-radius: 12px; width: fit-content; }
.grid { display: grid; gap: 10px; }
.mono { grid-template-columns: repeat(8, 1fr); }
.stereo { grid-template-columns: repeat(2, 1fr); }
.output { grid-template-columns: repeat(4, 1fr); }
.channel { background: #333; padding: 10px; border-radius: 6px; text-align: center; }
button {
    border-radius: 12px; margin: 6px; padding: 14px 20px; font-size: 18px; font-weight: bold; width: 100%; }
nav { text-align: center; margin-top: 20px; }

button.active {
    background: #228B22 !important;
    color: white !important;
}


/* Responsive Layout Enhancements */
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.fader-column {
  flex: 1 1 100px;
  max-width: 120px;
  min-width: 80px;
  margin: 5px;
}

@media (max-width: 768px) {
  .fader-column {
    max-width: 100px;
    min-width: 60px;
  }
  .label, .value-display {
    font-size: 0.8rem;
  }
  button {
    font-size: 0.75rem;
    padding: 6px;
  }
}
</style>
<style>
.glow-sync-button {
    background: linear-gradient(145deg, #1c1c2b, #0f0f1a);
    border: 2px solid #00bfff;
    color: #00bfff;
    font-weight: bold;
    font-size: 16px;
    padding: 10px 20px;
    border-radius: 10px;
    box-shadow: 0 0 10px #00bfff, 0 0 15px #00bfff inset;
    transition: all 0.3s ease;
    text-shadow: 0 0 3px #00bfff;
    cursor: pointer;
}
.glow-sync-button:hover {
    background: #101025;
    box-shadow: 0 0 12px #00e0ff, 0 0 18px #00e0ff inset;
}


/* Responsive Layout Enhancements */
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.fader-column {
  flex: 1 1 100px;
  max-width: 120px;
  min-width: 80px;
  margin: 5px;
}

@media (max-width: 768px) {
  .fader-column {
    max-width: 100px;
    min-width: 60px;
  }
  .label, .value-display {
    font-size: 0.8rem;
  }
  button {
    font-size: 0.75rem;
    padding: 6px;
  }
}
</style>
<script>
function toggleStereoMute(index) {
    console.log("Stereo mute clicked", index);
    const btn = document.getElementById(`st-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'stereo', index: index, state: isOn })
    });
}
function manualSync() {
    fetch('/sync-status', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            console.log("Manual sync complete", data);
            location.reload();
        });
}
</script>
</head><body>
{% if connected %}
<div style="position:absolute;top:10px;left:10px;background:#0a0;border-radius:6px;padding:6px 12px;font-weight:bold;">Connected</div>
{% else %}
<div style="position:absolute;top:10px;left:10px;background:#a00;border-radius:6px;padding:6px 12px;font-weight:bold;">Disconnected</div>
{% endif %}
<h1 style="text-align:center;">M-864D Control Dashboard</h1>

<script>
function toggleChannel(group, index, state) {
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: group, index: index, state: state })
    }).then(res => res.json()).then(data => {
        console.log(data);
    });
}

setInterval(() => {
    fetch('/matrix-state')
        .then(res => res.json())
        .then(matrix => {
            for (let row = 0; row < matrix.length; row++) {
                for (let col = 0; col < matrix[row].length; col++) {
                    const cell = document.getElementById(`cell-${row}-${col}`);
                    const button = cell.querySelector('button');
                    if (matrix[row][col] === 1) {
                        cell.classList.add('x');
                        button.innerText = 'X';
                    } else {
                        cell.classList.remove('x');
                        button.innerText = '';
                    }
                }
            }
        });
}, 2000);

window.addEventListener("load", () => {
  fetch("/matrix-watch?status=on");
});
window.addEventListener("beforeunload", () => {
  navigator.sendBeacon("/matrix-watch?status=off");
});

function setFaderGain(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, value: parseInt(value) })
    });
}

function muteChannel(index) {
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: false })
    }).then(() => {
        console.log(`Muted mono ${index}`);
    });
}



function toggleMute(index) {
    const btn = document.getElementById(`mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}




function toggleLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function setStereoFader(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'stereo', index: index, value: parseInt(value) })
    });
}
function toggleStereoMono(index) {
    const btn = document.getElementById(`mono-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MONO ON" : "MONO OFF";
    fetch('/toggle-stereo-mono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleStereoLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-stereo-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-stereo-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>
<form onsubmit="return false;">
    <div class="section">
        <h2>Mono Inputs</h2>
        <div class="grid mono">
            {% for i in range(NUM_MONO) %}
<div class="channel">
    <div style="margin-bottom: 8px;">Mono {{ i+1 }}</div>
    
<div class="canvas-fader" style="text-align:center;">
  <canvas width="100" height="300"></canvas>
  <div class="value-display" style="text-align:center;margin-top:10px;color:#0f0;font:14px monospace;"></div>
</div>

    <button class="mute-button {% if not state['mono'][i] %}active{% endif %}" id="mute-btn-{{ i }}" type="button" onclick="toggleMute({{ i }})">
{{ "MUTE OFF" if state['mono'][i] else "MUTE ON" }}</button>
    
        </div>
{% endfor %}
        </div>
    </div>
    



<div style="display: flex; gap: 8px; justify-content: center; align-items: flex-start; margin-bottom: 0;">
<div class="section">
    <h2>Stereo Inputs</h2>
    <div class="grid stereo">
        {% for i in range(NUM_STEREO) %}
        <div class="channel" style="width: 120px;">
            <div style="margin-bottom: 6px;">Stereo {{ i+1 }}</div>
            
<div class="canvas-fader" style="text-align:center;">
  <canvas width="100" height="300"></canvas>
  <div class="value-display" style="text-align:center;margin-top:10px;color:#0f0;font:14px monospace;"></div>
</div>

            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
    <button class="mute-button {% if not state['stereo'][i] %}active{% endif %}" id="st-mute-btn-{{ i }}" onclick="toggleStereoMute({{ i }})">
{{ "MUTE OFF" if state['stereo'][i] else "MUTE ON" }}</button>
    
</div>
                        </div>
        {% endfor %}
    </div>
</div>

<div class="section" style="margin-bottom: 40px; padding-bottom: 0;">
<h2>Outputs</h2>
    <div class="grid output">
        {% for i in range(NUM_OUTPUT) %}
        <div class="channel" style="width: 120px;">
            <div style="margin-bottom: 6px;">Output {{ i+1 }}</div>
            
<div class="canvas-fader" style="text-align:center;">
  <canvas width="100" height="300"></canvas>
  <div class="value-display" style="text-align:center;margin-top:10px;color:#0f0;font:14px monospace;"></div>
</div>

            <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
    <button class="mute-button {% if not state['output'][i] %}active{% endif %}" id="out-mute-btn-{{ i }}" style="padding: 6px 0; margin: 3px 0;" onclick="toggleOutputMute({{ i }})">
{{ "MUTE OFF" if state['output'][i] else "MUTE ON" }}</button>
    
</div>
        </div>
        {% endfor %}
    </div>
</div>





<div class="section">
    <h2>Rec Out</h2>
    <div class="grid" style="grid-template-columns: repeat(2, 1fr);">
        {% for i in range(2) %}
        <div class="channel">
            <div style="margin-bottom: 8px;">Rec Out {{ ['L','R'][i] }}</div>
            <button class="mute-button" id="rec-btn-{{ i }}" onclick="toggleRec({{ i }})">OFF</button>
        </div>
        {% endfor %}
    </div>
</div>


    
</form>


<div style="text-align:center; margin-top: 20px;">
    
</div>
<script>
function toggleLocal() {
    const btn = document.getElementById("local-btn");
    const isOn = btn.classList.toggle("active");
    btn.innerText = isOn ? "LOCAL ON" : "LOCAL OFF";
    fetch("/toggle-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: isOn })
    });
}
</script>

<nav><form method="get" action="/matrix"><button type="submit">Matrix</button></form>
<form method="get" action="/settings"><button type="submit">Settings</button></form><button class="glow-sync-button" onclick="manualSync()">SYNC</button><button id="local-btn" type="button" onclick="toggleLocal()">LOCAL OFF</button></nav>


<p style="text-align:center;">{{ message }}</p>



<script>


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>

<script>
document.querySelectorAll('.output .canvas-fader').forEach((fader, i) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Output slider", i, value);

    fetch('/output-fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
document.querySelectorAll('.stereo .canvas-fader').forEach((fader, stereoIndex) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Stereo slider", stereoIndex, value);

    fetch('/fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'stereo', index: stereoIndex, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
window.addEventListener('DOMContentLoaded', () => {
  const INIT = window.INIT_STATE || {};

  function setupGroup(selector, groupKey, postUrl, groupName) {
    document.querySelectorAll(selector).forEach((fader, index) => {
      const canvas = fader.querySelector('canvas');
      const valueDisplay = fader.querySelector('.value-display');
      const ctx = canvas.getContext('2d');
      let isDragging = false;
      let thumbY = 280;

      if (INIT[groupKey] && INIT[groupKey][index] !== undefined) {
        const gain = INIT[groupKey][index];
        thumbY = 280 - Math.round((gain / 63) * 240);
      }

      function drawSlider() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#222';
        ctx.fillRect(45, 20, 10, 260);
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        for (let j = 0; j <= 10; j++) {
          let y = 20 + j * 26;
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.lineTo(60, y);
          ctx.stroke();
          ctx.fillText(10 - j, 10, y + 3);
        }
        ctx.strokeStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(50, thumbY);
        ctx.lineTo(50, 280);
        ctx.stroke();
        ctx.fillStyle = '#ccc';
        ctx.fillRect(38, thumbY - 20, 24, 40);
        ctx.strokeStyle = '#999';
        ctx.strokeRect(38, thumbY - 20, 24, 40);
        ctx.beginPath();
        ctx.moveTo(40, thumbY);
        ctx.lineTo(62, thumbY);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      function updateReadout() {
        let value = Math.round((280 - thumbY) / 25 * 10) / 10;
        valueDisplay.textContent = value.toFixed(1);
      }

      function updateThumbY(mouseY) {
        const rect = canvas.getBoundingClientRect();
        let y = mouseY - rect.top;
        y = Math.max(30, Math.min(280, y));
        thumbY = y;
        drawSlider();
        updateReadout();

        let value = Math.round(((280 - thumbY - 10) / 240) * 12);
        value = Math.max(0, Math.min(63, Math.round(value * 6.3)));

        const payload = groupName === 'output'
          ? { index: index, value: value }
          : { group: groupName, index: index, value: value };

        fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      canvas.addEventListener('mousedown', (e) => { updateThumbY(e.clientY); isDragging = true; });
      window.addEventListener('mouseup', () => { isDragging = false; });
      window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

      drawSlider();
      updateReadout();
    });
  }

  setupGroup('.mono .canvas-fader', 'mono_fader', '/fader', 'mono');
  setupGroup('.stereo .canvas-fader', 'stereo_fader', '/fader', 'stereo');
  setupGroup('.output .canvas-fader', 'output_fader', '/output-fader', 'output');
});
</script>
</body></html>
""", NUM_MONO=NUM_MONO, NUM_STEREO=NUM_STEREO, NUM_OUTPUT=NUM_OUTPUT, message=message, connected=(mixer.socket is not None), state=state)

# ====== Settings Page ======
@app.route('/settings', methods=['GET', 'POST'])
def settings():
    global MATRIX_PAGE_ACTIVE
    MATRIX_PAGE_ACTIVE = False
    global config
    message = ""
    
    if request.method == 'POST':
        if 'ip' in request.form:
            new_ip = request.form.get('ip')
            if new_ip and new_ip != config['ip']:
                config['ip'] = new_ip
                save_config(config)
                mixer.ip = new_ip
                mixer.connect()
                message = f"IP updated to {new_ip}"
        if 'set_preset' in request.form:
            print("Set preset", request.form['set_preset'])
        elif 'load_preset' in request.form:
            print("Load preset", request.form['load_preset'])
        elif 'row' in request.form and 'col' in request.form:
            row = int(request.form.get('row'))
            col = int(request.form.get('col'))
            matrix_state[row][col] = 0 if matrix_state[row][col] == 1 else 1

            # Save updated matrix state
            with open(matrix_file, 'w') as f:
                json.dump(matrix_state, f)

            # Send matrix command
            if row < 8:
                send_matrix_assignment(mixer, 0x00, row, col, matrix_state[row][col])  # Mono
            else:
                send_matrix_assignment(mixer, 0x01, row - 8, col, matrix_state[row][col])  # Stereo

    return render_template_string("""<!DOCTYPE html>
<html><head><title>Settings</title>
<style>
body { background: #111; color: #eee; font-family: Arial; padding: 40px; text-align: center; }
input, button {
    border-radius: 12px; padding: 12px; font-size: 18px; width: 80%; margin: 10px auto; display: block; border-radius: 6px; border: none; background: #222; color: white; }
button {
    border-radius: 12px; background: #333; font-weight: bold; }

button.active {
    background: #228B22 !important;
    color: white !important;
}


/* Responsive Layout Enhancements */
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.fader-column {
  flex: 1 1 100px;
  max-width: 120px;
  min-width: 80px;
  margin: 5px;
}

@media (max-width: 768px) {
  .fader-column {
    max-width: 100px;
    min-width: 60px;
  }
  .label, .value-display {
    font-size: 0.8rem;
  }
  button {
    font-size: 0.75rem;
    padding: 6px;
  }
}
</style></head><body>
{% if connected %}
<div style="position:absolute;top:10px;left:10px;background:#0a0;border-radius:6px;padding:6px 12px;font-weight:bold;">Connected</div>
{% else %}
<div style="position:absolute;top:10px;left:10px;background:#a00;border-radius:6px;padding:6px 12px;font-weight:bold;">Disconnected</div>
{% endif %}
<h1>Change M-864D IP Address</h1>
<form method="post">
    <input name="ip" value="{{ ip }}" />
    <button type="submit">Save IP</button>
</form>
<form method="get" action="/"><button>Home</button></form>
<p>{{ message }}</p>

<script>


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>

<script>
document.querySelectorAll('.output .canvas-fader').forEach((fader, i) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Output slider", i, value);

    fetch('/output-fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
document.querySelectorAll('.stereo .canvas-fader').forEach((fader, stereoIndex) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Stereo slider", stereoIndex, value);

    fetch('/fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'stereo', index: stereoIndex, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
window.addEventListener('DOMContentLoaded', () => {
  const INIT = window.INIT_STATE || {};

  function setupGroup(selector, groupKey, postUrl, groupName) {
    document.querySelectorAll(selector).forEach((fader, index) => {
      const canvas = fader.querySelector('canvas');
      const valueDisplay = fader.querySelector('.value-display');
      const ctx = canvas.getContext('2d');
      let isDragging = false;
      let thumbY = 280;

      if (INIT[groupKey] && INIT[groupKey][index] !== undefined) {
        const gain = INIT[groupKey][index];
        thumbY = 280 - Math.round((gain / 63) * 240);
      }

      function drawSlider() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#222';
        ctx.fillRect(45, 20, 10, 260);
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        for (let j = 0; j <= 10; j++) {
          let y = 20 + j * 26;
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.lineTo(60, y);
          ctx.stroke();
          ctx.fillText(10 - j, 10, y + 3);
        }
        ctx.strokeStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(50, thumbY);
        ctx.lineTo(50, 280);
        ctx.stroke();
        ctx.fillStyle = '#ccc';
        ctx.fillRect(38, thumbY - 20, 24, 40);
        ctx.strokeStyle = '#999';
        ctx.strokeRect(38, thumbY - 20, 24, 40);
        ctx.beginPath();
        ctx.moveTo(40, thumbY);
        ctx.lineTo(62, thumbY);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      function updateReadout() {
        let value = Math.round((280 - thumbY) / 25 * 10) / 10;
        valueDisplay.textContent = value.toFixed(1);
      }

      function updateThumbY(mouseY) {
        const rect = canvas.getBoundingClientRect();
        let y = mouseY - rect.top;
        y = Math.max(30, Math.min(280, y));
        thumbY = y;
        drawSlider();
        updateReadout();

        let value = Math.round(((280 - thumbY - 10) / 240) * 12);
        value = Math.max(0, Math.min(63, Math.round(value * 6.3)));

        const payload = groupName === 'output'
          ? { index: index, value: value }
          : { group: groupName, index: index, value: value };

        fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      canvas.addEventListener('mousedown', (e) => { updateThumbY(e.clientY); isDragging = true; });
      window.addEventListener('mouseup', () => { isDragging = false; });
      window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

      drawSlider();
      updateReadout();
    });
  }

  setupGroup('.mono .canvas-fader', 'mono_fader', '/fader', 'mono');
  setupGroup('.stereo .canvas-fader', 'stereo_fader', '/fader', 'stereo');
  setupGroup('.output .canvas-fader', 'output_fader', '/output-fader', 'output');
});
</script>
</body></html>
""", ip=config['ip'], message=message, connected=(mixer.socket is not None), state=state)







@app.route('/matrix', methods=['GET', 'POST'])
def matrix():
    global MATRIX_PAGE_ACTIVE
    MATRIX_PAGE_ACTIVE = True
    matrix_file = 'matrix_state.json'

    # Load matrix state from file or initialize if not present
    if os.path.exists(matrix_file):
        with open(matrix_file, 'r') as f:
            matrix_state = json.load(f)
    else:
        matrix_file = 'matrix_state.json'
    if os.path.exists(matrix_file):
        with open(matrix_file, 'r') as f:
            matrix_state = json.load(f)
    else:
        matrix_state = [[0 for _ in range(4)] for _ in range(10)]

    
    if request.method == 'POST':
        if 'set_preset' in request.form:
            print("Set preset", request.form['set_preset'])
        elif 'load_preset' in request.form:
            print("Load preset", request.form['load_preset'])
        elif 'row' in request.form and 'col' in request.form:
            row = int(request.form.get('row'))
            col = int(request.form.get('col'))
            matrix_state[row][col] = 0 if matrix_state[row][col] == 1 else 1

            # Save updated matrix state
            with open(matrix_file, 'w') as f:
                json.dump(matrix_state, f)

            # Send matrix command
            if row < 8:
                send_matrix_assignment(mixer, 0x00, row, col, matrix_state[row][col])  # Mono
            else:
                send_matrix_assignment(mixer, 0x01, row - 8, col, matrix_state[row][col])  # Stereo

    return render_template_string("""<!DOCTYPE html>
<html><head><title>Matrix Control</title>
<style>
body {
    background: linear-gradient(145deg, #1a1a1a, #0f0f0f);
    color: #eee;
    font-family: 'Segoe UI', sans-serif;
    padding: 40px;
    text-align: center;
}
h1 {
    font-size: 36px;
    margin-bottom: 40px;
    color: #ccc;
    letter-spacing: 2px;
}
.matrix-grid {
    display: grid;
    grid-template-columns: repeat(5, 80px);
    gap: 12px;
    justify-content: center;
    margin: 0 auto 40px auto;
    background: #151515;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 0 12px #000;
}
.matrix-cell {
    width: 80px;
    height: 50px;
    background: #222;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 18px;
    font-weight: bold;
    color: #888;
    transition: background 0.3s, color 0.3s;
}
.matrix-cell.x {
    color: #4df96f;
    background: #1e1e1e;
    box-shadow: inset 0 0 6px #4df96f;
}
.matrix-cell button {
    border-radius: 12px;
    all: unset;
    width: 100%;
    height: 100%;
    text-align: center;
    cursor: pointer;
}
button {
    border-radius: 12px;
    margin: 12px;
    padding: 14px 30px;
    font-size: 18px;
    font-weight: bold;
    background: #2a2a2a;
    color: #fff;
    border: none;
    border-radius: 6px;
    box-shadow: 0 0 6px #000;
    transition: background 0.3s;
}
button:hover {
    background: #444;
    cursor: pointer;
}

button.active {
    background: #228B22 !important;
    color: white !important;
}


/* Responsive Layout Enhancements */
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.fader-column {
  flex: 1 1 100px;
  max-width: 120px;
  min-width: 80px;
  margin: 5px;
}

@media (max-width: 768px) {
  .fader-column {
    max-width: 100px;
    min-width: 60px;
  }
  .label, .value-display {
    font-size: 0.8rem;
  }
  button {
    font-size: 0.75rem;
    padding: 6px;
  }
}
</style></head><body>
<h1>DSP Matrix Control</h1>
<form method="post">

<div style="display: flex; justify-content: center;">
  <div style="display: flex; flex-direction: row; gap: 40px; align-items: flex-start;">
    <div style="background: #1a1a1a; padding: 20px; border-radius: 16px; box-shadow: 0 0 12px #000;">
      <h2 style="color: #ccc; margin-bottom: 20px;">Presets</h2>
      

  {% for i in range(1, 5) %}
  <button type="button" onclick="triggerPreset('set', {{ i - 1 }})"
    style="font-size: 20px; padding: 12px; border-radius: 6px; background: #1f1f1f; color: #ccc; border: 2px solid #666; font-weight: bold; margin-bottom: 10px; width: 120px;">Set {{ i }}</button>
  {% endfor %}
  <br/>
  {% for i in range(1, 5) %}
  <button type="button" onclick="triggerPreset('load', {{ i - 1 }})"
    style="font-size: 20px; padding: 12px; border-radius: 6px; background: #1f1f1f; color: #ccc; border: 2px solid #666; font-weight: bold; margin-bottom: 10px; width: 120px;">Load {{ i }}</button>
  {% endfor %}
</div>
<script>
function triggerPreset(action, index) {
    fetch('/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, index: index })
    }).then(res => res.json()).then(data => {
        console.log('Preset', action, index, data);
    });
}

setInterval(() => {
    fetch('/matrix-state')
        .then(res => res.json())
        .then(matrix => {
            for (let row = 0; row < matrix.length; row++) {
                for (let col = 0; col < matrix[row].length; col++) {
                    const cell = document.getElementById(`cell-${row}-${col}`);
                    const button = cell.querySelector('button');
                    if (matrix[row][col] === 1) {
                        cell.classList.add('x');
                        button.innerText = 'X';
                    } else {
                        cell.classList.remove('x');
                        button.innerText = '';
                    }
                }
            }
        });
}, 2000);

window.addEventListener("load", () => {
  fetch("/matrix-watch?status=on");
});
window.addEventListener("beforeunload", () => {
  navigator.sendBeacon("/matrix-watch?status=off");
});

function setFaderGain(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, value: parseInt(value) })
    });
}

function muteChannel(index) {
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: false })
    }).then(() => {
        console.log(`Muted mono ${index}`);
    });
}



function toggleMute(index) {
    const btn = document.getElementById(`mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}




function toggleLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function setStereoFader(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'stereo', index: index, value: parseInt(value) })
    });
}
function toggleStereoMono(index) {
    const btn = document.getElementById(`mono-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MONO ON" : "MONO OFF";
    fetch('/toggle-stereo-mono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleStereoLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-stereo-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-stereo-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>

    </div>

<div class="matrix-grid">
    <div class="matrix-cell"></div>
    {% for out in range(4) %}
    <div class="matrix-cell">OUT {{ out+1 }}</div>
    {% endfor %}
    {% for row in range(10) %}
    <div class="matrix-cell">{{ 'Mono ' ~ (row+1) if row < 8 else 'Stereo ' ~ (row-7) }}</div>
    {% for col in range(4) %}
        <div class="matrix-cell {% if matrix[row][col] %}x{% endif %}" id="cell-{{row}}-{{col}}">
            <button type="button" onclick="toggleMatrix({{row}}, {{col}})">{{ 'X' if matrix[row][col] else '' }}</button>
        </div>
    {% endfor %}
    {% endfor %}
</div>

<script>
function toggleMatrix(row, col) {
    fetch('/matrix-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row: row, col: col })
    }).then(res => res.json()).then(data => {
        const cell = document.getElementById(`cell-${row}-${col}`);
        const button = cell.querySelector('button');
        if (data.value === 1) {
            cell.classList.add('x');
            button.innerText = 'X';
        } else {
            cell.classList.remove('x');
            button.innerText = '';
        }
    });
}

setInterval(() => {
    fetch('/matrix-state')
        .then(res => res.json())
        .then(matrix => {
            for (let row = 0; row < matrix.length; row++) {
                for (let col = 0; col < matrix[row].length; col++) {
                    const cell = document.getElementById(`cell-${row}-${col}`);
                    const button = cell.querySelector('button');
                    if (matrix[row][col] === 1) {
                        cell.classList.add('x');
                        button.innerText = 'X';
                    } else {
                        cell.classList.remove('x');
                        button.innerText = '';
                    }
                }
            }
        });
}, 2000);

window.addEventListener("load", () => {
  fetch("/matrix-watch?status=on");
});
window.addEventListener("beforeunload", () => {
  navigator.sendBeacon("/matrix-watch?status=off");
});

function setFaderGain(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, value: parseInt(value) })
    });
}

function muteChannel(index) {
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: false })
    }).then(() => {
        console.log(`Muted mono ${index}`);
    });
}



function toggleMute(index) {
    const btn = document.getElementById(`mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}




function toggleLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function setStereoFader(index, value) {
    fetch('/fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'stereo', index: index, value: parseInt(value) })
    });
}
function toggleStereoMono(index) {
    const btn = document.getElementById(`mono-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MONO ON" : "MONO OFF";
    fetch('/toggle-stereo-mono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleStereoLowCut(index) {
    const btn = document.getElementById(`lowcut-btn-stereo-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "LowCut ON" : "LowCut OFF";
    fetch('/toggle-stereo-lowcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function setOutputFader(index, value) {
    fetch('/output-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, value: parseInt(value) })
    });
}
function toggleOutputMute(index) {
    const btn = document.getElementById(`out-mute-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "MUTE ON" : "MUTE OFF";
    fetch('/toggle-output-mute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>


</form>
<div style="margin-top: 40px;"><form method="get" action="/"><button>Home</button></form></div>


<script>


function togglePower(index) {
    const btn = document.getElementById(`power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'mono', index: index, state: isOn })
    });
}


function toggleStereoPower(index) {
    const btn = document.getElementById(`st-power-btn-${index}`);
    const isNowOn = btn.classList.toggle('active');
    const newState = !isNowOn;
    btn.innerText = newState ? "Power OFF" : "Power ON";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: \'stereo\', index: index, state: newState })
    });
}



function toggleRec(index) {
    const btn = document.getElementById(`rec-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "ON" : "OFF";
    fetch('/toggle-rec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: index, state: isOn })
    });
}

function toggleOutputPower(index) {
    const btn = document.getElementById(`out-power-btn-${index}`);
    const isOn = btn.classList.toggle('active');
    btn.innerText = isOn ? "Power ON" : "Power OFF";
    fetch('/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'output', index: index, state: isOn })
    });
}

</script>

<script>
document.querySelectorAll('.output .canvas-fader').forEach((fader, i) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Output slider", i, value);

    fetch('/output-fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: i, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
document.querySelectorAll('.stereo .canvas-fader').forEach((fader, stereoIndex) => {
  const canvas = fader.querySelector('canvas');
  const valueDisplay = fader.querySelector('.value-display');
  const ctx = canvas.getContext('2d');
  let isDragging = false;
  let thumbY = 280;

  function drawSlider() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222';
    ctx.fillRect(45, 20, 10, 260);
    ctx.fillStyle = '#aaa';
    ctx.font = '10px sans-serif';
    for (let j = 0; j <= 10; j++) {
      let y = 20 + j * 26;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(60, y);
      ctx.stroke();
      ctx.fillText(10 - j, 10, y + 3);
    }
    ctx.strokeStyle = '#0f0';
    ctx.beginPath();
    ctx.moveTo(50, thumbY);
    ctx.lineTo(50, 280);
    ctx.stroke();
    ctx.fillStyle = '#ccc';
    ctx.fillRect(38, thumbY - 20, 24, 40);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(38, thumbY - 20, 24, 40);
    ctx.beginPath();
    ctx.moveTo(40, thumbY);
    ctx.lineTo(62, thumbY);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function updateReadout() {
    let value = Math.round((280 - thumbY) / 25 * 10) / 10;
    valueDisplay.textContent = value.toFixed(1);
  }

  function updateThumbY(mouseY) {
    const rect = canvas.getBoundingClientRect();
    let y = mouseY - rect.top;
    if (y < 30) y = 30;
    if (y > 280) y = 280;
    thumbY = y;
    drawSlider();
    updateReadout();

    let value = Math.round(((280 - thumbY - 10) / 240) * 12);
    value = Math.max(0, Math.min(63, Math.round(value * 6.3)));
    console.log("Stereo slider", stereoIndex, value);

    fetch('/fader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: 'stereo', index: stereoIndex, value: value })
    });
  }

  canvas.addEventListener('mousedown', (e) => {
    updateThumbY(e.clientY);
    isDragging = true;
  });
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

  drawSlider();
  updateReadout();
});
</script>
<script>
window.addEventListener('DOMContentLoaded', () => {
  const INIT = window.INIT_STATE || {};

  function setupGroup(selector, groupKey, postUrl, groupName) {
    document.querySelectorAll(selector).forEach((fader, index) => {
      const canvas = fader.querySelector('canvas');
      const valueDisplay = fader.querySelector('.value-display');
      const ctx = canvas.getContext('2d');
      let isDragging = false;
      let thumbY = 280;

      if (INIT[groupKey] && INIT[groupKey][index] !== undefined) {
        const gain = INIT[groupKey][index];
        thumbY = 280 - Math.round((gain / 63) * 240);
      }

      function drawSlider() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#222';
        ctx.fillRect(45, 20, 10, 260);
        ctx.fillStyle = '#aaa';
        ctx.font = '10px sans-serif';
        for (let j = 0; j <= 10; j++) {
          let y = 20 + j * 26;
          ctx.beginPath();
          ctx.moveTo(40, y);
          ctx.lineTo(60, y);
          ctx.stroke();
          ctx.fillText(10 - j, 10, y + 3);
        }
        ctx.strokeStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(50, thumbY);
        ctx.lineTo(50, 280);
        ctx.stroke();
        ctx.fillStyle = '#ccc';
        ctx.fillRect(38, thumbY - 20, 24, 40);
        ctx.strokeStyle = '#999';
        ctx.strokeRect(38, thumbY - 20, 24, 40);
        ctx.beginPath();
        ctx.moveTo(40, thumbY);
        ctx.lineTo(62, thumbY);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      function updateReadout() {
        let value = Math.round((280 - thumbY) / 25 * 10) / 10;
        valueDisplay.textContent = value.toFixed(1);
      }

      function updateThumbY(mouseY) {
        const rect = canvas.getBoundingClientRect();
        let y = mouseY - rect.top;
        y = Math.max(30, Math.min(280, y));
        thumbY = y;
        drawSlider();
        updateReadout();

        let value = Math.round(((280 - thumbY - 10) / 240) * 12);
        value = Math.max(0, Math.min(63, Math.round(value * 6.3)));

        const payload = groupName === 'output'
          ? { index: index, value: value }
          : { group: groupName, index: index, value: value };

        fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      canvas.addEventListener('mousedown', (e) => { updateThumbY(e.clientY); isDragging = true; });
      window.addEventListener('mouseup', () => { isDragging = false; });
      window.addEventListener('mousemove', (e) => { if (isDragging) updateThumbY(e.clientY); });

      drawSlider();
      updateReadout();
    });
  }

  setupGroup('.mono .canvas-fader', 'mono_fader', '/fader', 'mono');
  setupGroup('.stereo .canvas-fader', 'stereo_fader', '/fader', 'stereo');
  setupGroup('.output .canvas-fader', 'output_fader', '/output-fader', 'output');
});
</script>
</body></html>
""", matrix=matrix_state)





@app.route('/toggle', methods=['POST'])
def toggle():
    data = request.json
    group = data.get('group')
    index = int(data.get('index'))
    state = data.get('state')  # true or false
    send_channel_onoff(mixer, group, index, state)
    return {'status': 'ok'}



@app.route('/matrix-toggle', methods=['POST'])
def matrix_toggle():
    data = request.json
    row = int(data['row'])
    col = int(data['col'])
    matrix_file = 'matrix_state.json'

    if os.path.exists(matrix_file):
        with open(matrix_file, 'r') as f:
            matrix_state = json.load(f)
    else:
        matrix_state = [[0 for _ in range(4)] for _ in range(10)]

    matrix_state[row][col] = 0 if matrix_state[row][col] == 1 else 1

    with open(matrix_file, 'w') as f:
        json.dump(matrix_state, f)

    if row < 8:
        send_matrix_assignment(mixer, 0x00, row, col, matrix_state[row][col])  # Mono
    else:
        send_matrix_assignment(mixer, 0x01, row - 8, col, matrix_state[row][col])  # Stereo

    return {'status': 'ok', 'value': matrix_state[row][col]}




@app.route('/matrix-state')
def matrix_state_poll():
    try:
        with open('matrix_state.json', 'r') as f:
            return json.load(f)
    except:
        return [[0 for _ in range(4)] for _ in range(10)]


@app.route('/preset', methods=['POST'])
def preset():
    data = request.json
    action = data.get('action')
    index = int(data.get('index'))
    matrix_file = 'matrix_state.json'

    if action == 'set':
        if os.path.exists(matrix_file):
            with open(matrix_file, 'r') as f:
                matrix_state = json.load(f)
        else:
            matrix_state = [[0 for _ in range(4)] for _ in range(10)]

        for row in range(10):
            for col in range(4):
                val = matrix_state[row][col]
                if row < 8:
                    send_matrix_assignment(mixer, 0x00, row, col, val)
                else:
                    send_matrix_assignment(mixer, 0x01, row - 8, col, val)
        time.sleep(0.25)
        send_preset_store(mixer, index)

    elif action == 'load':
        send_preset_load(mixer, index)
        time.sleep(0.25)
        matrix_state = [[0 for _ in range(4)] for _ in range(10)]
        for row in range(10):
            for col in range(4):
                if row < 8:
                    state = get_matrix_assignment(mixer, 0x00, row, col)
                else:
                    state = get_matrix_assignment(mixer, 0x01, row - 8, col)
                matrix_state[row][col] = 1 if state else 0
        with open(matrix_file, 'w') as f:
            json.dump(matrix_state, f)

    return {'status': 'ok'}


def run_flask():
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)

@app.route('/toggle-mute', methods=['POST'])
def toggle_mute():
    data = request.json
    index = int(data['index'])
    state = data['state']

    if index < 8:
        attr = 0  # Mono
        ch = index
        mute_byte = 0x00 if state else 0x01  # Mono: 0 = ON, 1 = MUTE
    else:
        attr = 1  # Stereo
        ch = index - 8
        mute_byte = 0x01 if state else 0x00  # Stereo: 1 = ON, 0 = MUTE

    cmd = bytes([0x92, 0x03, attr, ch, mute_byte])
    mixer.send(cmd)
    print(f"Sent MUTE to {'Mono' if attr == 0 else 'Stereo'} {ch + 1}: {'ON' if state else 'MUTE'}")
    return {'status': 'ok'}

@app.route('/toggle-output-mute', methods=['POST'])
def toggle_output_mute():
    data = request.json
    index = int(data['index'])
    state = data['state']

    attr = 2  # Output
    ch = index
    mute_byte = 0x00 if state else 0x01  # 0 = ON, 1 = MUTE

    cmd = bytes([0x92, 0x03, attr, ch, mute_byte])
    mixer.send(cmd)
    print(f"Sent MUTE to Output {ch + 1}: {'ON' if state else 'MUTE'}")
    return {'status': 'ok'}


@app.route('/toggle-local', methods=['POST'])
def toggle_local():
    data = request.json
    state = data['state']  # True = LOCAL, False = UNLOCAL
    cmd = bytes([0xF4, 0x02, 0x00, 0x01 if state else 0x00])
    mixer.send(cmd)
    print(f"Sent LOCAL Status: {'LOCAL' if state else 'UNLOCAL'}")
    return {'status': 'ok'}



@app.route('/toggle-rec', methods=['POST'])
def toggle_rec():
    data = request.json
    index = int(data['index'])  # 0 = L, 1 = R
    state = data['state']       # True = ON, False = OFF
    attr = 0x03  # Rec Out channel
    ch = index
    cmd = bytes([0x92, 0x03, attr, ch, 0x01 if state else 0x00])
    mixer.send(cmd)
    print(f"Sent REC OUT {['L', 'R'][ch]}: {'ON' if state else 'OFF'}")
    return {'status': 'ok'}




@app.route('/sync-status', methods=['POST'])
def sync_status():
    global state
    updated = {
        'mono': [False]*NUM_MONO,
        'stereo': [False]*NUM_STEREO,
        'output': [False]*NUM_OUTPUT,
        'mono_fader': [0]*NUM_MONO,
        'stereo_fader': [0]*NUM_STEREO,
        'output_fader': [0]*NUM_OUTPUT
    }

    def get_mute_response(attr, ch):
        cmd = bytes([0xF0, 0x03, 0x12, attr, ch])
        mixer.send(cmd)
        start = time.time()
        while time.time() - start < 0.5:
            try:
                mixer.socket.settimeout(0.25)
                data = mixer.socket.recv(1024)
                for i in range(len(data) - 4):
                    if data[i] == 0x92 and data[i+1] == 0x03 and data[i+2] == attr and data[i+3] == ch:
                        return data[i+4] == 0x01
            except:
                pass
        return False

    def get_fader_value(attr, ch):
        cmd = bytes([0xF0, 0x03, 0x11, attr, ch])
        mixer.send(cmd)
        start = time.time()
        buffer = b""
        while time.time() - start < 1.0:
            try:
                mixer.socket.settimeout(0.25)
                chunk = mixer.socket.recv(1024)
                buffer += chunk
                for i in range(len(buffer) - 4):
                    if buffer[i] == 0x91 and buffer[i+1] == 0x03 and buffer[i+2] == attr and buffer[i+3] == ch:
                        return buffer[i+4]
            except:
                pass
        return 0

    for i in range(NUM_MONO):
        updated['mono'][i] = get_mute_response(0x00, i)
        updated['mono_fader'][i] = get_fader_value(0x00, i)

    for i in range(NUM_STEREO):
        updated['stereo'][i] = get_mute_response(0x01, i)
        updated['stereo_fader'][i] = get_fader_value(0x01, i)

    for i in range(NUM_OUTPUT):
        updated['output'][i] = get_mute_response(0x02, i)
        updated['output_fader'][i] = get_fader_value(0x02, i)

    state = updated
    save_state(state)
    return {'status': 'synced'}

@app.route('/fader', methods=['POST'])
def fader():
    data = request.json
    group = data.get('group')  # 'mono' or 'stereo'
    index = int(data.get('index'))
    value = int(data.get('value'))

    attr_map = {
        'mono': 0x00,
        'stereo': 0x01
    }

    if group in attr_map and 0 <= value <= 63:
        attr = attr_map[group]
        cmd = bytes([0x91, 0x03, attr, index, value])
        print(f"📤 FADER {group.upper()} → {cmd.hex()}")
        mixer.send(cmd)
    else:
        print(f"❌ Invalid fader group or value: group={group}, index={index}, value={value}")

    return {'status': 'ok'}


@app.route('/output-fader', methods=['POST'])
def output_fader():
    data = request.json
    index = int(data['index'])
    value = int(data['value'])
    # Channel Attribute for Mono Out is 0x02
    mixer.send(bytes([0x91, 0x03, 0x02, index, value]))
    return {'status': 'ok'}


if __name__ == '__main__':
    threading.Thread(target=run_flask, daemon=True).start()
    webview.create_window("M-864D Control Interface", "http://127.0.0.1:5000/")
    webview.start()


