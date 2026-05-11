import spacy
nlp = spacy.load("en_core_web_sm")
d1 = nlp("Robots don't feel.")
d2 = nlp("Should AI replace teachers? AI can provide personalized learning. But teachers give emotional support.")
print("Similarity:", d1.similarity(d2))
d3 = nlp("I like eating apples because they are very tasty and juicy.")
print("Similarity Apple:", d3.similarity(d2))
