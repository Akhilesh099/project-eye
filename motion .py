import cv2
import tkinter as tk
from PIL import Image, ImageTk
import time
import os
import asyncio
from ultralytics import YOLO
from supabase import create_client, create_async_client
import threading
import numpy as np

# --- CONFIG ---
URL = "https://fuuwbjvroywribizpcrw.supabase.co"
KEY = "sb_secret_fF3gDQrcmO1_EvUgrzGs4w_q5Yh_3KC"

print("🧠 Project Eye: Booting with Motion Detection...")
model = YOLO('yolov8n.pt')
supabase_sync = create_client(URL, KEY)

class ProjectEyeApp:
    def __init__(self, window):
        self.window = window
        self.window.title("Project Eye - Motion Console")
        self.window.geometry("800x900")
        self.window.configure(bg="#0a0a0a")
        
        self.cap = cv2.VideoCapture(0)
        self.video_label = tk.Label(window, bg="#141414")
        self.video_label.pack(padx=20, pady=10)

        # --- MOTION SETTINGS ---
        self.motion_enabled = tk.BooleanVar(value=False)
        self.last_frame = None
        self.motion_threshold = 500000  # Sensitivity (lower = more sensitive)
        
        self.controls = tk.Frame(window, bg="#0a0a0a")
        self.controls.pack(pady=10)

        tk.Checkbutton(self.controls, text="ENABLE AUTO-MOTION SCAN", variable=self.motion_enabled,
                       bg="#0a0a0a", fg="#3ecf8e", selectcolor="#141414", 
                       font=("Inter", 12, "bold")).pack(side="left", padx=10)

        self.scan_btn = tk.Button(window, text="MANUAL SCAN", command=self.trigger_scan, 
                                  bg="#3ecf8e", font=("Inter", 14, "bold"), padx=50, pady=15)
        self.scan_btn.pack(side="bottom", pady=20)

        self.current_frame = None
        self.detected_objects = []
        self.is_uploading = False

        self.update_loop()
        threading.Thread(target=self.run_async, daemon=True).start()

    def detect_motion(self, frame):
        """Simple Pixel Change Detection"""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (21, 21), 0)

        if self.last_frame is None:
            self.last_frame = gray
            return False

        frame_delta = cv2.absdiff(self.last_frame, gray)
        thresh = cv2.threshold(frame_delta, 25, 255, cv2.THRESH_BINARY)[1]
        self.last_frame = gray
        
        # Calculate how much movement is happening
        movement_score = np.sum(thresh)
        return movement_score > self.motion_threshold

    def update_loop(self):
        ret, frame = self.cap.read()
        if ret:
            # Check for Motion
            if self.motion_enabled.get() and not self.is_uploading:
                if self.detect_motion(frame):
                    print("⚠️ MOTION DETECTED! Triggering Auto-Scan...")
                    self.window.after(0, self.trigger_scan)

            # AI Detection
            results = model(frame, verbose=False)[0]
            self.current_frame = results.plot()
            self.detected_objects = list(set([model.names[int(b.cls[0])] for b in results.boxes]))
            
            img = Image.fromarray(cv2.cvtColor(self.current_frame, cv2.COLOR_BGR2RGB)).resize((600, 450))
            img_tk = ImageTk.PhotoImage(image=img)
            self.video_label.imgtk = img_tk
            self.video_label.configure(image=img_tk)
            
        self.window.after(10, self.update_loop)

    def trigger_scan(self):
        if self.current_frame is None or self.is_uploading: return
        
        self.is_uploading = True
        print("🚀 Syncing to Cloud...")
        self.scan_btn.config(text="SCANNING...", state="disabled")
        
        fname = f"scan_{int(time.time())}.jpg"
        cv2.imwrite(fname, self.current_frame)

        try:
            supabase_sync.storage.from_("scans").upload(fname, open(fname, 'rb'))
            url = supabase_sync.storage.from_("scans").get_public_url(fname)
            supabase_sync.table("detections").insert({
                "image_url": url, 
                "objects_found": self.detected_objects,
                "created_at": "now()"
            }).execute()
            print(f"✅ SUCCESS: {fname}")
        except Exception as e:
            print(f"❌ FAILED: {e}")
        
        if os.path.exists(fname): os.remove(fname)
        
        # Cooldown period of 5 seconds to avoid spamming the cloud
        self.window.after(5000, self.reset_scan_button)

    def reset_scan_button(self):
        self.is_uploading = False
        self.scan_btn.config(text="MANUAL SCAN", state="normal")

    def run_async(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self.listen())

    async def listen(self):
        try:
            client_async = await create_async_client(URL, KEY)
            channel = client_async.channel('project-eye-commands')
            await channel.on_broadcast("manual-scan", lambda x: self.window.after(0, self.trigger_scan)).subscribe()
            print("✅ WEB LINK: ACTIVE")
            while True: await asyncio.sleep(1)
        except Exception as e:
            print(f"❌ WEB LINK ERROR: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = ProjectEyeApp(root)
    root.mainloop()