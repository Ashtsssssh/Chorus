const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  diskPath:     { type: String, required: true },
  url:          { type: String, default: null },
  originalName: { type: String, default: null },
  sizeBytes:    { type: Number, default: null },
}, { _id: false });

const jobSchema = new mongoose.Schema({
  submitterId: { type: String, required: true },

  status: {
    type: String,
    enum: ['pending', 'compiling', 'ready', 'distributing', 'complete', 'failed'],
    default: 'pending',
  },

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
    resultHash: { type: String,  default: null },
  }],

  errorDetail: { type: String, default: null },

}, { timestamps: true });

jobSchema.methods.toPublic = function () {
  const strip = (asset) => {
    if (!asset) return null;
    const { diskPath, ...rest } = asset.toObject ? asset.toObject() : asset;
    return rest;
  };
  return {
    id:          this._id,
    submitterId: this.submitterId,
    status:      this.status,
    totalChunks: this.totalChunks,
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