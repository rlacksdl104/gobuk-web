from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from datetime import datetime

app = FastAPI(title='Posture Monitor API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

class ScoreEntry(BaseModel):
    timestamp: datetime
    score: int
    status: str

stats: List[ScoreEntry] = []

@app.get('/stats')
def get_stats():
    return {
        'recent': [entry.dict() for entry in stats[-8:]],
        'average': int(sum(entry.score for entry in stats[-8:]) / max(len(stats[-8:]), 1)) if stats else 0,
    }

@app.post('/score')
def post_score(entry: ScoreEntry):
    stats.append(entry)
    return {'success': True, 'current': entry.dict()}
