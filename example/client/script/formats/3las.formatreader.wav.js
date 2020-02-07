/*
    WAV audio format reader is part of 3LAS (Low Latency Live Audio Streaming)
    https://github.com/JoJoBond/3LAS
*/
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var AudioFormatReader_WAV = /** @class */ (function (_super) {
    __extends(AudioFormatReader_WAV, _super);
    function AudioFormatReader_WAV(audio, logger, errorCallback, dataReadyCallback, batchLength, extraEdgeLength) {
        var _this = _super.call(this, audio, logger, errorCallback, dataReadyCallback) || this;
        _this._OnDecodeSuccess = _this.OnDecodeSuccess.bind(_this);
        _this._OnDecodeError = _this.OnDecodeError.bind(_this);
        _this.BatchLength = batchLength;
        _this.ExtraEdgeLength = extraEdgeLength;
        _this.GotHeader = false;
        _this.RiffHeader = null;
        _this.WaveSampleRate = 0;
        _this.WaveBitsPerSample = 0;
        _this.WaveBytesPerSample = 0;
        _this.WaveBlockAlign = 0;
        _this.WaveChannels = 0;
        _this.DataBuffer = new Uint8Array(0);
        _this.FloatSamples = new Array();
        _this.BufferStore = {};
        _this.BatchSamples = 0;
        _this.BatchBytes = 0;
        _this.ExtraEdgeSamples = 0;
        _this.TotalBatchSampleSize = 0;
        _this.TotalBatchByteSize = 0;
        _this.SampleBudget = 0;
        _this.Id = 0;
        _this.LastPushedId = -1;
        return _this;
    }
    // Pushes int sample data into the buffer
    AudioFormatReader_WAV.prototype.PushData = function (data) {
        // Append data to pagedata buffer
        this.DataBuffer = this.ConcatUint8Array(this.DataBuffer, data);
        // Try to extract pages
        this.ExtractAllIntSamples();
    };
    // Check if there are any samples ready for playback
    AudioFormatReader_WAV.prototype.SamplesAvailable = function () {
        return (this.FloatSamples.length > 0);
    };
    // Returns a bunch of samples for playback and removes the from the array
    AudioFormatReader_WAV.prototype.PopSamples = function () {
        if (this.FloatSamples.length > 0) {
            // Get first bunch of samples, remove said bunch from the array and hand it back to callee
            return this.FloatSamples.shift();
        }
        else
            return null;
    };
    // Used to force sample extraction externaly
    AudioFormatReader_WAV.prototype.Poke = function () {
        this.ExtractAllIntSamples();
    };
    // Deletes all samples from the databuffer and the samplearray
    AudioFormatReader_WAV.prototype.PurgeData = function () {
        this.DataBuffer = new Uint8Array(0);
        this.FloatSamples = new Array();
    };
    AudioFormatReader_WAV.prototype.ExtractAllIntSamples = function () {
        if (!this.GotHeader)
            this.FindAndExtractHeader();
        else {
            var _loop_1 = function () {
                // Extract samples
                var tmpSamples = this_1.ExtractIntSamples();
                // Note:
                // =====
                // When audio data is resampled we get edge-effects at beginnging and end.
                // We should be able to compensate for that by keeping the last sample of the
                // previous batch and adding it to the beginning of the current one, but then
                // cutting it out AFTER the resampling (since the same effects apply to it)
                // The effects at the end can be compensated by cutting the resampled samples shorter
                // This is not trivial for non-natural ratios (e.g. 16kHz -> 44.1kHz). Because we would have
                // to cut out a non-natural number of samples at beginning and end.
                // TODO: All of the above...
                // Create a buffer long enough to hold everything
                var samplesBuffer = new Uint8Array(this_1.RiffHeader.length + tmpSamples.length);
                var offset = 0;
                // Add header
                samplesBuffer.set(this_1.RiffHeader, offset);
                offset += this_1.RiffHeader.length;
                // Add samples
                samplesBuffer.set(tmpSamples, offset);
                // Increment Id
                var id = this_1.Id++;
                // Push pages to the decoder
                this_1.Audio.decodeAudioData(samplesBuffer.buffer, (function (decodedData) {
                    var _id = id;
                    this._OnDecodeSuccess(decodedData, _id);
                }).bind(this_1), this_1._OnDecodeError);
            };
            var this_1 = this;
            while (this.CanExtractSamples()) {
                _loop_1();
            }
        }
    };
    // Finds riff header within the data buffer and extracts it
    AudioFormatReader_WAV.prototype.FindAndExtractHeader = function () {
        var curpos = 0;
        // Make sure a whole header can fit
        if (!((curpos + 4) < this.DataBuffer.length))
            return;
        // Check chunkID, should be "RIFF"
        if (!(this.DataBuffer[curpos] == 0x52 && this.DataBuffer[curpos + 1] == 0x49 && this.DataBuffer[curpos + 2] == 0x46 && this.DataBuffer[curpos + 3] == 0x46))
            return;
        curpos += 8;
        if (!((curpos + 4) < this.DataBuffer.length))
            return;
        // Check riffType, should be "WAVE"
        if (!(this.DataBuffer[curpos] == 0x57 && this.DataBuffer[curpos + 1] == 0x41 && this.DataBuffer[curpos + 2] == 0x56 && this.DataBuffer[curpos + 3] == 0x45))
            return;
        curpos += 4;
        if (!((curpos + 4) < this.DataBuffer.length))
            return;
        // Check for format subchunk, should be "fmt "
        if (!(this.DataBuffer[curpos] == 0x66 && this.DataBuffer[curpos + 1] == 0x6d && this.DataBuffer[curpos + 2] == 0x74 && this.DataBuffer[curpos + 3] == 0x20))
            return;
        curpos += 4;
        if (!((curpos + 4) < this.DataBuffer.length))
            return;
        var subChunkSize = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8 | this.DataBuffer[curpos + 2] << 16 | this.DataBuffer[curpos + 3] << 24;
        if (!((curpos + 4 + subChunkSize) < this.DataBuffer.length))
            return;
        curpos += 6;
        this.WaveChannels = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;
        curpos += 2;
        this.WaveSampleRate = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8 | this.DataBuffer[curpos + 2] << 16 | this.DataBuffer[curpos + 3] << 24;
        curpos += 8;
        this.WaveBlockAlign = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;
        curpos += 2;
        this.WaveBitsPerSample = this.DataBuffer[curpos] | this.DataBuffer[curpos + 1] << 8;
        this.WaveBytesPerSample = this.WaveBitsPerSample / 8;
        curpos += subChunkSize - 14;
        while (true) {
            if ((curpos + 8) < this.DataBuffer.length) {
                subChunkSize = this.DataBuffer[curpos + 4] | this.DataBuffer[curpos + 5] << 8 | this.DataBuffer[curpos + 6] << 16 | this.DataBuffer[curpos + 7] << 24;
                // Check for data subchunk, should be "data"
                if (this.DataBuffer[curpos] == 0x64 && this.DataBuffer[curpos + 1] == 0x61 && this.DataBuffer[curpos + 2] == 0x74 && this.DataBuffer[curpos + 3] == 0x61) // Data chunk found
                    break;
                else
                    curpos += 8 + subChunkSize;
            }
            else
                return;
        }
        curpos += 8;
        this.RiffHeader = new Uint8Array(this.DataBuffer.buffer.slice(0, curpos));
        this.BatchSamples = Math.ceil(this.BatchLength * this.WaveSampleRate);
        this.ExtraEdgeSamples = Math.ceil(this.ExtraEdgeLength * this.WaveSampleRate);
        this.BatchBytes = this.BatchSamples * this.WaveBlockAlign;
        this.TotalBatchSampleSize = (this.BatchSamples + this.ExtraEdgeSamples);
        this.TotalBatchByteSize = this.TotalBatchSampleSize * this.WaveBlockAlign;
        var chunkSize = this.RiffHeader.length + this.TotalBatchByteSize - 8;
        // Fix header chunksizes
        this.RiffHeader[4] = chunkSize & 0xFF;
        this.RiffHeader[5] = (chunkSize & 0xFF00) >>> 8;
        this.RiffHeader[6] = (chunkSize & 0xFF0000) >>> 16;
        this.RiffHeader[7] = (chunkSize & 0xFF000000) >>> 24;
        this.RiffHeader[this.RiffHeader.length - 4] = (this.TotalBatchByteSize & 0xFF);
        this.RiffHeader[this.RiffHeader.length - 3] = (this.TotalBatchByteSize & 0xFF00) >>> 8;
        this.RiffHeader[this.RiffHeader.length - 2] = (this.TotalBatchByteSize & 0xFF0000) >>> 16;
        this.RiffHeader[this.RiffHeader.length - 1] = (this.TotalBatchByteSize & 0xFF000000) >>> 24;
        this.GotHeader = true;
    };
    // Checks if there is a samples ready to be extracted
    AudioFormatReader_WAV.prototype.CanExtractSamples = function () {
        if (this.DataBuffer.length >= this.TotalBatchByteSize)
            return true;
        else
            return false;
    };
    // Extract a single batch of samples from the buffer
    AudioFormatReader_WAV.prototype.ExtractIntSamples = function () {
        // Extract sample data from buffer
        var intSampleArray = new Uint8Array(this.DataBuffer.buffer.slice(0, this.TotalBatchByteSize));
        // Remove samples from buffer
        this.DataBuffer = new Uint8Array(this.DataBuffer.buffer.slice(this.BatchBytes));
        return intSampleArray;
    };
    // Is called if the decoding of the samples succeeded
    AudioFormatReader_WAV.prototype.OnDecodeSuccess = function (decodedData, id) {
        // Calculate the length of the parts
        var pickSize = this.BatchLength * decodedData.sampleRate;
        this.SampleBudget += (pickSize - Math.ceil(pickSize));
        pickSize = Math.ceil(pickSize);
        var pickOffset = (decodedData.length - pickSize) / 2.0;
        if (pickOffset < 0)
            pickOffset = 0; // This should never happen!
        else
            pickOffset = Math.floor(pickOffset);
        if (this.SampleBudget < -1.0) {
            var correction = -1.0 * Math.floor(Math.abs(this.SampleBudget));
            this.SampleBudget -= correction;
            pickSize += correction;
        }
        else if (this.SampleBudget > 1.0) {
            var correction = Math.floor(this.SampleBudget);
            this.SampleBudget -= correction;
            pickSize += correction;
        }
        // Create a buffer that can hold a single part
        var audioBuffer = this.Audio.createBuffer(decodedData.numberOfChannels, pickSize, decodedData.sampleRate);
        // Fill buffer with the last part of the decoded frame
        for (var i = 0; i < decodedData.numberOfChannels; i++)
            audioBuffer.getChannelData(i).set(decodedData.getChannelData(i).slice(pickOffset, -pickOffset));
        if (this.LastPushedId + 1 == id) {
            // Push samples into array
            this.FloatSamples.push(audioBuffer);
            this.LastPushedId++;
            while (this.BufferStore[this.LastPushedId + 1]) {
                // Push samples we decoded earlier in correct oder
                this.FloatSamples.push(this.BufferStore[this.LastPushedId + 1]);
                delete this.BufferStore[this.LastPushedId + 1];
                this.LastPushedId++;
            }
            // Callback to tell that data is ready
            this.DataReadyCallback();
        }
        else {
            // Is out of order, will be pushed later
            this.BufferStore[id] = audioBuffer;
        }
    };
    // Is called in case the decoding of the window fails
    AudioFormatReader_WAV.prototype.OnDecodeError = function (_error) {
        this.ErrorCallback();
    };
    return AudioFormatReader_WAV;
}(AudioFormatReader));
//# sourceMappingURL=3las.formatreader.wav.js.map