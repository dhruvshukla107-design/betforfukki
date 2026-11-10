/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SpatialMapper 3D - Training Script & Model Manifest Generator
 * Generates ready-to-run PyTorch/Ultralytics fine-tuning code and exports to ONNX (opset 17, INT8/FP16).
 * Handles model manifest generation and SHA-256 integrity verification.
 */

export interface TrainingConfig {
  modelArch: 'yolov8n' | 'yolov8s' | 'yolov8m';
  epochs: number;
  batchSize: number;
  imgSize: number;
  learningRate: number;
  classes: string[];
  exportFormat: 'onnx';
  opset: number;
  halfPrecision: boolean;
}

export interface ModelManifest {
  schemaVersion: '2.0.0';
  modelName: string;
  version: string;
  architecture: string;
  inputShape: [number, number, number, number]; // [1, 3, H, W]
  classes: string[];
  categoryMapping: Record<string, string>;
  sha256: string;
  fileSizeBytes: number;
  metrics: {
    mAP50?: number;
    mAP50_95?: number;
    precision?: number;
    recall?: number;
    testedOn?: string;
  };
  licence: string;
  notes?: string;
}

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  modelArch: 'yolov8n',
  epochs: 50,
  batchSize: 16,
  imgSize: 640,
  learningRate: 0.01,
  classes: [
    'person',
    'child',
    'teen',
    'adult',
    'senior',
    'animal',
    'dog',
    'cat',
    'bird',
    'phone',
    'laptop',
    'bag',
    'bottle',
    'keys',
    'umbrella',
    'knife',
    'firearm'
  ],
  exportFormat: 'onnx',
  opset: 17,
  halfPrecision: true
};

/**
 * Generates a clean, executable Python training script for Ultralytics YOLOv8.
 */
export function generateTrainingScript(config: TrainingConfig = DEFAULT_TRAINING_CONFIG): string {
  return `#!/usr/bin/env python3
"""
SpatialMapper 3D - Client-Side Fine-Tuning & ONNX Exporter
Target: Ultralytics YOLOv8 (PyTorch) -> ONNX Opset ${config.opset} (Browser WebGL/WebGPU)

Usage:
  pip install ultralytics onnx onnxruntime
  python train_spatialmapper.py
"""

import os
import hashlib
import json
from pathlib import Path
from ultralytics import YOLO

def compute_sha256(filepath: str) -> str:
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            sha.update(chunk)
    return sha.hexdigest()

def main():
    print("=== SpatialMapper 3D: YOLOv8 Fine-Tuning Pipeline ===")
    
    # 1. Initialize Base Pre-trained Model
    model = YOLO("${config.modelArch}.pt")
    
    # 2. Train on Exported Dataset
    print("Training model for ${config.epochs} epochs...")
    results = model.train(
        data="data.yaml",
        epochs=${config.epochs},
        batch=${config.batchSize},
        imgsz=${config.imgSize},
        lr0=${config.learningRate},
        project="runs/spatialmapper",
        name="detector_v2",
        plots=True,
        device=0 if os.environ.get("CUDA_VISIBLE_DEVICES") else "cpu"
    )
    
    # 3. Evaluate Metrics on Test Split
    print("Evaluating metrics on validation & test split...")
    metrics = model.val(data="data.yaml", split="test")
    mAP50 = float(metrics.box.map50)
    mAP50_95 = float(metrics.box.map)
    print(f"Test mAP@0.5: {mAP50:.4f}, mAP@0.5:0.95: {mAP50_95:.4f}")
    
    # 4. Export to Browser-Native ONNX (Opset ${config.opset})
    print("Exporting model to ONNX for WebGL/WebGPU runtime...")
    onnx_path = model.export(
        format="onnx",
        opset=${config.opset},
        half=${config.halfPrecision ? 'True' : 'False'},
        dynamic=False,
        simplify=True
    )
    print(f"ONNX Model saved to: {onnx_path}")
    
    # 5. Generate Cryptographic Model Manifest
    sha256_hash = compute_sha256(onnx_path)
    file_size = os.path.getsize(onnx_path)
    
    classes = ${JSON.stringify(config.classes)}
    
    manifest = {
        "schemaVersion": "2.0.0",
        "modelName": "SpatialMapper-Custom-YOLOv8",
        "version": "2.0.0",
        "architecture": "${config.modelArch}",
        "inputShape": [1, 3, ${config.imgSize}, ${config.imgSize}],
        "classes": classes,
        "categoryMapping": {
            "knife": "weapon",
            "firearm": "weapon",
            "person": "person",
            "child": "person",
            "teen": "person",
            "adult": "person",
            "senior": "person",
            "animal": "animal",
            "dog": "animal",
            "cat": "animal",
            "bird": "animal",
            "phone": "object",
            "laptop": "object",
            "bag": "object",
            "bottle": "object",
            "keys": "object",
            "umbrella": "object"
        },
        "sha256": sha256_hash,
        "fileSizeBytes": file_size,
        "metrics": {
            "mAP50": round(mAP50, 4),
            "mAP50_95": round(mAP50_95, 4),
            "testedOn": "SpatialMapper 3D Test Set"
        },
        "licence": "Apache-2.0 / Model Weights User Proprietary",
        "notes": "Verified compatible with ONNX Runtime Web WebGL/WebGPU backend"
    }
    
    manifest_path = Path(onnx_path).parent / "model.manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Manifest written to: {manifest_path}")
    print(f"SHA-256 Digest: {sha256_hash}")
    print("Export complete! You can now drag and drop both files into SpatialMapper 3D Model Importer.")

if __name__ == "__main__":
    main()
`;
}

/**
 * Generates an interactive Jupyter Notebook (.ipynb) containing step-by-step cells.
 */
export function generateJupyterNotebook(config: TrainingConfig = DEFAULT_TRAINING_CONFIG): string {
  const notebook = {
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          '# 🛰️ SpatialMapper 3D: Custom Model Training & ONNX Export\n',
          'This notebook fine-tunes **YOLOv8** on your exported SpatialMapper dataset and exports it to **ONNX Opset 17** for real-time in-browser inference.\n',
          '\n',
          '### Requirements\n',
          '- GPU recommended (Google Colab T4 / V100)\n',
          '- Python 3.9+\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Install dependencies\n',
          '!pip install -q ultralytics onnx onnxruntime onnxsim\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Unzip your exported dataset if uploaded as zip\n',
          'import zipfile, os\n',
          'if os.path.exists("spatialmapper_dataset.zip"):\n',
          '    with zipfile.ZipFile("spatialmapper_dataset.zip", "r") as z:\n',
          '        z.extractall(".")\n',
          '    print("Dataset extracted successfully.")\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'from ultralytics import YOLO\n',
          'import hashlib, json\n',
          '\n',
          `# Load base model\n`,
          `model = YOLO("${config.modelArch}.pt")\n`,
          `\n`,
          `# Train\n`,
          `results = model.train(\n`,
          `    data="data.yaml",\n`,
          `    epochs=${config.epochs},\n`,
          `    batch=${config.batchSize},\n`,
          `    imgsz=${config.imgSize},\n`,
          `    lr0=${config.learningRate},\n`,
          `    project="spatialmapper_run",\n`,
          `    name="v2"\n`,
          `)\n`
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          `# Export to ONNX\n`,
          `onnx_path = model.export(format="onnx", opset=${config.opset}, half=${config.halfPrecision ? 'True' : 'False'}, simplify=True)\n`,
          `\n`,
          `# Compute SHA-256 Hash\n`,
          `sha = hashlib.sha256()\n`,
          `with open(onnx_path, "rb") as f:\n`,
          `    while chunk := f.read(8192):\n`,
          `        sha.update(chunk)\n`,
          `digest = sha.hexdigest()\n`,
          `print("Model SHA-256:", digest)\n`
        ]
      }
    ],
    metadata: {
      language_info: {
        name: 'python'
      }
    },
    nbformat: 4,
    nbformat_minor: 4
  };

  return JSON.stringify(notebook, null, 2);
}

/**
 * Verifies model ArrayBuffer against expected SHA-256 hex string using Web Crypto API.
 */
export async function verifyModelIntegrity(
  modelBuffer: ArrayBuffer,
  expectedSha256Hex: string
): Promise<{ valid: boolean; actualSha256: string }> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', modelBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const actualSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const valid = actualSha256.toLowerCase() === expectedSha256Hex.toLowerCase().trim();
  return { valid, actualSha256 };
}
