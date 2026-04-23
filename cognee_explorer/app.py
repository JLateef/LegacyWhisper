import requests
import streamlit as st

st.set_page_config(page_title="Cognee Explorer", page_icon="🔍", layout="wide")

st.title("🔍 Cognee Knowledge Explorer")
st.caption("Query the knowledge graph built from Legacy Whisperer documents.")

# ── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Configuration")
    backend_url = st.text_input("Backend URL", value="http://localhost:8000")
    dataset_name = st.text_input("Dataset name", value="legacy_interview")
    search_type = st.selectbox(
        "Search type",
        options=["GRAPH_COMPLETION", "RAG_COMPLETION", "CHUNKS", "SUMMARIES"],
        index=0,
        help="GRAPH_COMPLETION uses graph context + vector similarity (recommended). "
             "CHUNKS returns raw document chunks.",
    )
    top_k = st.slider("Top K results", min_value=1, max_value=20, value=10)

    st.divider()
    st.subheader("Ingested documents")
    if st.button("Refresh document list"):
        try:
            resp = requests.get(f"{backend_url}/api/documents", timeout=5)
            resp.raise_for_status()
            docs = resp.json()
            if docs:
                for doc in docs:
                    status_icon = "✅" if doc["status"] == "ingested" else "⏳"
                    st.write(f"{status_icon} **{doc['name']}** ({doc['status']})")
            else:
                st.info("No documents uploaded yet.")
        except Exception as e:
            st.error(f"Could not reach backend: {e}")

# ── Main pane ─────────────────────────────────────────────────────────────────
query_text = st.text_area(
    "Enter your query",
    placeholder="e.g. Who are the key vendor contacts and what do I need to know about them?",
    height=120,
)

search_btn = st.button("Search", type="primary", disabled=not query_text.strip())

if search_btn and query_text.strip():
    payload = {
        "query_text": query_text,
        "search_type": search_type,
        "dataset_name": dataset_name,
        "top_k": top_k,
    }

    with st.spinner("Searching knowledge graph…"):
        try:
            resp = requests.post(
                f"{backend_url}/api/query",
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.ConnectionError:
            st.error("Could not connect to the backend. Is it running?")
            st.stop()
        except requests.exceptions.HTTPError as e:
            st.error(f"Backend error {resp.status_code}: {resp.text}")
            st.stop()
        except Exception as e:
            st.error(f"Unexpected error: {e}")
            st.stop()

    results = data.get("results", [])

    if not results:
        st.warning("No results returned. Try a different query or search type.")
    else:
        st.success(f"{len(results)} result(s) found.")
        for i, result in enumerate(results, 1):
            with st.expander(f"Result {i}", expanded=(i == 1)):
                st.write(result)

        with st.expander("Raw JSON response"):
            st.json(data)
