class ModelStore:
    # sentence_model removed — use scikit-learn TF-IDF instead (no PyTorch/torch needed)
    logic_model = None
    evidence_model = None
    clarity_model = None


model_store = ModelStore()
