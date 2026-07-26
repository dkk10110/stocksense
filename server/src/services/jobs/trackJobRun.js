const prisma = require('../../lib/prisma');

/** Wraps a job function, recording its start/finish/outcome in the JobRun table for visibility. */
async function trackJobRun(jobName, fn) {
  const run = await prisma.jobRun.create({ data: { jobName } });
  try {
    const result = await fn();
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: 'success', summary: summarize(result) },
    });
    return result;
  } catch (err) {
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: 'failed', error: err.message },
    });
    throw err;
  }
}

function summarize(result) {
  if (!result || typeof result !== 'object') return null;
  return JSON.stringify(result).slice(0, 500);
}

module.exports = { trackJobRun };
