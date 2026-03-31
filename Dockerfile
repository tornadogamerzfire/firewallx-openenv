FROM python:3.11

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir fastapi uvicorn pydantic requests

EXPOSE 7860

CMD ["uvicorn", "env.main:app", "--host", "0.0.0.0", "--port", "7860"]