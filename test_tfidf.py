from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def check_relevance(argument, topic, context):
    reference_doc = topic + " " + " ".join(context)
    try:
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform([reference_doc, argument])
        sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        return float(sim)
    except Exception as e:
        return 1.0

print("1. Apple spam:", check_relevance("I like eating apples because they are very tasty and juicy.", "Should AI replace teachers?", ["AI can provide personalized learning.", "But teachers give emotional support."]))

print("2. Relevant synonym:", check_relevance("Robots don't have feelings so they cannot bond with kids.", "Should AI replace teachers?", ["AI can provide personalized learning.", "But teachers give emotional support."]))

print("3. Short weak argument:", check_relevance("I disagree with that point.", "Should AI replace teachers?", ["AI can provide personalized learning.", "But teachers give emotional support."]))

