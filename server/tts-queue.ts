import crypto from "crypto";

export interface QueueJob {
  id: string;
  userId: string;
  username: string;
  contactName: string;
  textPreview: string;
  priority: "high" | "normal";
  status: "queued" | "processing" | "done" | "error";
  progress: number;
  progressLabel: string;
  result?: any;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  runFn: () => Promise<any>;
}

const queue: QueueJob[] = [];
let isProcessing = false;

const PROGRESS_STAGES = [
  { delay: 0,     progress: 5,  label: "Preparing…" },
  { delay: 300,   progress: 18, label: "Generating speech audio…" },
  { delay: 1500,  progress: 38, label: "Generating speech audio…" },
  { delay: 3000,  progress: 55, label: "Connecting to speaker…" },
  { delay: 5000,  progress: 70, label: "Sending audio…" },
  { delay: 7500,  progress: 84, label: "Sending audio…" },
  { delay: 10000, progress: 91, label: "Finalizing…" },
];

const PRESET_PROGRESS_STAGES = [
  { delay: 0,    progress: 10, label: "Priority preset — starting…" },
  { delay: 200,  progress: 40, label: "Connecting to speaker…" },
  { delay: 1500, progress: 65, label: "Streaming audio…" },
  { delay: 4000, progress: 85, label: "Streaming audio…" },
  { delay: 7000, progress: 93, label: "Finalizing…" },
];

export function enqueueJob(job: {
  userId: string;
  username: string;
  contactName: string;
  textPreview: string;
  priority?: "high" | "normal";
  runFn: () => Promise<any>;
}): string {
  const id = crypto.randomBytes(8).toString("hex");
  const priority = job.priority ?? "normal";
  const newJob: QueueJob = {
    ...job,
    id,
    priority,
    status: "queued",
    progress: 0,
    progressLabel: priority === "high" ? "Priority — waiting…" : "Waiting in queue…",
    createdAt: Date.now(),
  };

  if (priority === "high") {
    // Insert before the first normal-priority queued job (FIFO among high-priority)
    const firstNormalIdx = queue.findIndex(
      (j) => j.status === "queued" && j.priority === "normal"
    );
    if (firstNormalIdx === -1) {
      queue.push(newJob);
    } else {
      queue.splice(firstNormalIdx, 0, newJob);
    }
  } else {
    queue.push(newJob);
  }

  scheduleProcess();
  return id;
}

export function getJobStatus(jobId: string) {
  const idx = queue.findIndex((j) => j.id === jobId);
  if (idx === -1) return null;
  const job = queue[idx];

  const activeJobs = queue.filter((j) => j.status === "queued" || j.status === "processing");
  const myActiveIdx = activeJobs.findIndex((j) => j.id === jobId);
  const queuePosition = myActiveIdx >= 0 ? myActiveIdx + 1 : 1;
  const totalInQueue = activeJobs.length;

  return {
    id: job.id,
    status: job.status,
    priority: job.priority,
    progress: job.progress,
    progressLabel: job.progressLabel,
    queuePosition,
    totalInQueue,
    contactName: job.contactName,
    textPreview: job.textPreview,
    result: job.result,
    error: job.error,
  };
}

export function getQueueLength(): number {
  return queue.filter((j) => j.status === "queued" || j.status === "processing").length;
}

function scheduleProcess() {
  if (!isProcessing) processNext();
}

async function processNext() {
  if (isProcessing) return;

  const nextJob = queue.find((j) => j.status === "queued");
  if (!nextJob) return;

  isProcessing = true;
  nextJob.status = "processing";

  const stages = nextJob.priority === "high" ? PRESET_PROGRESS_STAGES : PROGRESS_STAGES;
  const timers: ReturnType<typeof setTimeout>[] = stages.map(({ delay, progress, label }) =>
    setTimeout(() => {
      if (nextJob.status === "processing") {
        nextJob.progress = progress;
        nextJob.progressLabel = label;
      }
    }, delay)
  );

  try {
    const result = await nextJob.runFn();
    timers.forEach(clearTimeout);
    nextJob.status = "done";
    nextJob.progress = 100;
    nextJob.progressLabel = nextJob.priority === "high"
      ? "Priority announcement delivered!"
      : "Announcement delivered!";
    nextJob.result = result;
    nextJob.finishedAt = Date.now();
  } catch (err: any) {
    timers.forEach(clearTimeout);
    nextJob.status = "error";
    nextJob.progress = 100;
    nextJob.progressLabel = err.message || "Failed";
    nextJob.error = err.message || "Announcement failed";
    nextJob.finishedAt = Date.now();
  } finally {
    isProcessing = false;
    setTimeout(() => {
      const i = queue.indexOf(nextJob);
      if (i > -1) queue.splice(i, 1);
    }, 10 * 60 * 1000);
    processNext();
  }
}
