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
    enum: ['pending', 'compiling', 'ready', 'chunking', 'distributing', 'assembling', 'complete', 'failed'],
    default: 'pending',
  },
  sourceHash: { type: String, required: true },
  assets: {
    dataFile:   { type: assetSchema, default: null },
    chunker:    { type: assetSchema, default: null },
    assembler:  { type: assetSchema, default: null },
    wasmBinary: { type: assetSchema, default: null },
    finalOutput:{ type: assetSchema, default: null },
  },
  chunkerType:  { type: String, enum: ['line', 'csv', 'json-array', 'byte-range'], required: true },
  assemblerType:{ type: String, enum: ['line', 'csv', 'json-array', 'byte-range'], required: true },

  chunks: [{
    index:      { type: Number, required: true },
    diskPath:   { type: String, required: true },
    status:     { type: String, enum: ['pending', 'in-flight', 'complete', 'failed'], default: 'pending' },
    resultPath: { type: String, default: null },
    resultHash: { type: String, default: null },
  }],

  errorDetail:  { type: String, default: null },
}, { timestamps: true });

// Strip internal disk paths before sending to client
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
    assets: {
      dataFile:   strip(this.assets.dataFile),
      chunker:    strip(this.assets.chunker),
      assembler:  strip(this.assets.assembler),
      wasmBinary: strip(this.assets.wasmBinary),
      finalOutput:strip(this.assets.finalOutput),
    },
    errorDetail:  this.errorDetail,
    chunkerType:  this.chunkerType,
    assemblerType:this.assemblerType,
    chunks:       this.chunks.map(c => ({
      index:      c.index,
      status:     c.status,
      hasResult:  !!c.resultPath,
    })),
    createdAt:    this.createdAt,
  };
};

module.exports = mongoose.model('Job', jobSchema);