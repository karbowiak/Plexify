import { Capability, type Backend, type BackendMetadata } from '../types';

export class DemoBackend implements Backend {
	readonly id = 'demo';
	readonly capabilities = new Set<Capability>(Object.values(Capability));
	private _connected = false;

	readonly metadata: BackendMetadata = {
		name: 'Demo Backend',
		description: 'Local demo data for testing and development.',
		icon: 'server',
		version: '1.0.0',
		author: 'Built-in',
		configFields: [
			{
				key: 'serverUrl',
				label: 'Server URL',
				type: 'url',
				placeholder: 'https://your-server.example.com',
				required: true
			},
			{
				key: 'apiToken',
				label: 'API Token',
				type: 'password',
				placeholder: 'Enter your API token',
				required: true
			},
			{
				key: 'autoSync',
				label: 'Auto-sync library',
				type: 'toggle'
			}
		]
	};

	async connect(_config: Record<string, unknown>): Promise<void> {
		this._connected = true;
	}

	async disconnect(): Promise<void> {
		this._connected = false;
	}

	isConnected(): boolean {
		return this._connected;
	}

	supports(capability: Capability): boolean {
		return this.capabilities.has(capability);
	}
}
