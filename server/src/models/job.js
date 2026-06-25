const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  diskPath:     { type: String, required: true },
  url:          { type: String, default: null },
  originalName: { type: String, default: null },
  sizeBytes:    { type: Number, default: null },
}, { _id: false });

const jobSchema = new mongoose.Schema({
  submitterId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  
  jobName: { type: String, default: 'Untitled Job' },
  description: { type: String, default: '' },

  status: {
    type: String,
    enum: ['pending', 'compiling', 'ready', 'distributing', 'complete', 'failed'],
    default: 'pending',
  },

  visibility: {
    type: String,
    enum: ['public', 'private', 'protected'],
    default: 'public',
  },

  password: { type: String, default: null },

  sourceHash:  { type: String, required: true },
  totalChunks: { type: Number, default: null },

  assets: {
    wasmBinary: { type: assetSchema, default: null },
  },

  chunks: [{
    index:      { type: Number,  required: true },
    diskPath:   { type: String,  required: true },
    status:     { type: String,  enum: ['pending', 'in-flight', 'complete', 'failed'], default: 'pending' },
    workerId:   { type: String,  default: null },
    resultPath: { type: String,  default: null },
  }],

  errorDetail: { type: String, default: null },

}, { timestamps: true });

jobSchema.methods.toPublic = function () {
  const strip = (asset) => {
    if (!asset) return null;
    const { diskPath, ...rest } = asset.toObject ? asset.toObject() : asset;
    return rest;
  };

  const completedChunks = this.chunks.filter(c => c.status === 'complete').length;
  const workers = new Set(this.chunks.filter(c => c.workerId).map(c => c.workerId)).size;

  return {
    id:          this._id,
    submitterId: this.submitterId,
    userId:      this.userId,
    name:        this.jobName,
    description: this.description,
    status:      this.status,
    visibility:  this.visibility,
    totalChunks: this.totalChunks,
    completedChunks: completedChunks,
    workerCount: workers,
    assets: {
      wasmBinary: strip(this.assets.wasmBinary),
    },
    chunks: this.chunks.map(c => ({
      index:     c.index,
      status:    c.status,
      workerId:  c.workerId,
      hasResult: !!c.resultPath,
    })),
    errorDetail: this.errorDetail,
    createdAt:   this.createdAt,
  };
};

module.exports = mongoose.model('Job', jobSchema);