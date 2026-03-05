/**
 * ICY protocol metadata parser.
 * Strips ICY metadata from an audio stream and extracts song info.
 *
 * ICY protocol: every `metaInt` bytes of audio data, a metadata block appears.
 * The block starts with a length byte (actual length = byte * 16), followed by
 * text like `StreamTitle='Artist - Song';StreamUrl='http://...';`
 */

export interface IcyMetadata {
	streamTitle: string;
	streamUrl?: string;
}

/** Parse ICY metadata string like `StreamTitle='Artist - Song';StreamUrl='...';` */
export function parseIcyString(raw: string): IcyMetadata {
	const result: Record<string, string> = {};
	const regex = /(\w+)='([^']*)';/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(raw)) !== null) {
		result[match[1]] = match[2];
	}
	return {
		streamTitle: result['StreamTitle'] ?? '',
		streamUrl: result['StreamUrl'] || undefined
	};
}

/**
 * Creates a TransformStream that strips ICY metadata from audio data
 * and calls onMetadata when new metadata is found.
 */
export function createIcyParser(
	metaInt: number,
	onMetadata: (meta: IcyMetadata) => void
): TransformStream<Uint8Array, Uint8Array> {
	let bytesUntilMeta = metaInt;
	let metaBuffer: number[] = [];
	let metaBytesRemaining = -1; // -1 = reading audio, 0+ = reading metadata

	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			let offset = 0;

			while (offset < chunk.length) {
				if (metaBytesRemaining === -1) {
					// Reading audio data
					const audioBytes = Math.min(bytesUntilMeta, chunk.length - offset);
					controller.enqueue(chunk.subarray(offset, offset + audioBytes));
					offset += audioBytes;
					bytesUntilMeta -= audioBytes;

					if (bytesUntilMeta === 0) {
						// Next byte is the metadata length byte
						metaBytesRemaining = 0;
					}
				} else if (metaBytesRemaining === 0 && metaBuffer.length === 0) {
					// Read the length byte
					const lengthByte = chunk[offset++];
					metaBytesRemaining = lengthByte * 16;

					if (metaBytesRemaining === 0) {
						// No metadata this interval
						bytesUntilMeta = metaInt;
						metaBytesRemaining = -1;
					}
				} else {
					// Reading metadata bytes
					const metaBytes = Math.min(metaBytesRemaining, chunk.length - offset);
					for (let i = 0; i < metaBytes; i++) {
						metaBuffer.push(chunk[offset + i]);
					}
					offset += metaBytes;
					metaBytesRemaining -= metaBytes;

					if (metaBytesRemaining === 0) {
						// Complete metadata block
						const decoder = new TextDecoder('utf-8');
						const raw = decoder.decode(new Uint8Array(metaBuffer)).replace(/\0+$/, '');
						metaBuffer = [];
						bytesUntilMeta = metaInt;
						metaBytesRemaining = -1;

						if (raw.length > 0) {
							const parsed = parseIcyString(raw);
							if (parsed.streamTitle) {
								onMetadata(parsed);
							}
						}
					}
				}
			}
		}
	});
}
