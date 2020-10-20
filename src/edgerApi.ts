/*
 * Copyright (c) 2019 EdgerOS Team.
 * All rights reserved.
 *
 * Detailed license information can be found in the LICENSE file.
 *
 * File: edgerApi.ts, Edger API client.
 *
 * Author: Li Qiang <liqiang@acoinfo.com>
 *
 */

import AdmZip = require('adm-zip');
import FormData = require('form-data');
import * as vscode from 'vscode';
import * as fs from "fs";
import axios from "axios";

import { Edger, EdgerDeivceProvider } from './edgerDeviceProvider';
import { edger_ide_port } from './constants';
import { WorkspaceApi } from './workspaceApi';

export class EdgerApi {
	_context: vscode.ExtensionContext;
	_edgerDeviceProvider: EdgerDeivceProvider;
	_workspace: WorkspaceApi;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._edgerDeviceProvider = new EdgerDeivceProvider(context);
		this._workspace = new WorkspaceApi(context);
	}

	async install(edger: Edger): Promise<void> {
		const edger_ip: string = edger.deviceIP;
		if (!edger_ip || !vscode.workspace.workspaceFolders) {
			return;
		}

		// ask for device password
		let pass_options: vscode.InputBoxOptions = {
			value: edger ? edger.devicePass : '',
			prompt: "Edger Device Password.",
			placeHolder: "(device password)"
		};
		const dev_pass = await vscode.window.showInputBox(pass_options);
		if (dev_pass === undefined) {
			console.log('Installation cancelled.');
			return;
		}
		// save device password
		this._edgerDeviceProvider.updatePassword(edger, dev_pass);

		// archive eap file
		var eap_file: string = await this.archive();
		if (!eap_file || eap_file === ''){
			console.log('Archiving eap file failed.');
			return;
		}

		// upload eap to edger device
		await this.uploadEap(eap_file, edger_ip, dev_pass).then(() => {
			vscode.window.showInformationMessage('Upload eap completed.');
		}).catch((err) => {
			vscode.window.showErrorMessage(`Upload eap failed - ${err.message}`);
		});

		// install/update eap on edger device
		var eap_name = eap_file.split("/").pop();
		if (!eap_name){
			console.log('Can not get eap file name');
			return;
		}
		await this.installEap(edger_ip, dev_pass, eap_name).then(() => {
			vscode.window.showInformationMessage('Install eap completed.');
		}).catch((err) => {
			vscode.window.showErrorMessage(`Install eap failed - ${err.message}`);
		});
	}

	async archive(): Promise<string> {
		if (!vscode.workspace.workspaceFolders) {
			throw new Error("Can't open workspace.");
		}

		var projectRootFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
		// check if app's desc.json is valid
		await this._workspace.checkDescJson(projectRootFolder).then(undefined, (err) => {
			console.log(err);
			throw new Error(err);
		});

		let eap_name = vscode.workspace.name + '.eap';
		var admZip = new AdmZip();
		var eap_file_path = '';
		try {
			console.log(`workspace path: ${projectRootFolder}`);
			eap_file_path = projectRootFolder + '/' + eap_name;
			if (fs.existsSync(eap_file_path)) {
				fs.unlinkSync(eap_file_path);
			}
			admZip.addLocalFolder(projectRootFolder);
			admZip.writeZip(eap_file_path);
			vscode.window.showInformationMessage(`Archiving eap succeeded: ${eap_name}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Archiving eap failed - ${error.message}`);
			throw new Error(error);
		}
		return eap_file_path;
	}

	private async uploadEap(eap_path: string, edger_ip: string, dev_pass: string) {
		const form = new FormData();
		form.append('eap', fs.createReadStream(eap_path));
		console.log(`device pass is: ${dev_pass}`);
		const uploadApiConfig = {
			baseURL: `http://${edger_ip}:${edger_ide_port}/`,
			auth: {
				username: 'edger',
				password: dev_pass
			},
			headers: form.getHeaders()
		};
		await axios.post('/upload', form, uploadApiConfig)
			.then(function (response) {
				console.log(`Upload succeeded: ${response}`);
			})
			.catch(function (err) {
				console.log(`Upload failed: ${err}`);
				throw new Error(err);
			});
	}

	private async installEap(edger_ip: string, dev_pass: string, eap_name: string) {
		const installApiConfig = {
			baseURL: `http://${edger_ip}:${edger_ide_port}/`,
			auth: {
				username: 'edger',
				password: dev_pass
			},
			headers: {
				common: {
					"Content-Type": "application/json",
				},
			},
		};
		await axios.post('/install', {
			eap: eap_name
		}, installApiConfig)
			.then(function (response) {
				console.log(`Installation succeeded: ${response}`);
			})
			.catch(function (err) {
				console.log(`Installation failed: ${err}`);
				throw new Error(err);
			});
	}
} 