<a id="readme-top"></a>

<br />

<div align="center">
  <h3 align="center">DMS</h3>
  <p align="center">
    Document Management System with AI-powered chat and analysis
    <br />
  </p>
</div>

---

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

## About The Project

DMS is an AI-assisted document management platform. Users can upload documents, generate embeddings, classify content, and chat globally or against specific documents using AI.

### Built With

- [Next.js](https://nextjs.org/)
- [React.js](https://reactjs.org/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Poetry](https://python-poetry.org/)
- [Node.js](https://nodejs.org/en)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

Get a local copy up and running by following these steps.

### Prerequisites

- pnpm

  ```sh
  npm install -g pnpm
  ```

- poetry

  ```sh
  pip install poetry
  ```

### Installation

#### App (Next.js)

1. Change directory to `app`

   ```sh
   cd app
   ```

2. Install packages

   ```sh
   pnpm install
   ```

3. Configure environment variables

   Create an `.env` file with required values (e.g., `DATABASE_URL`, auth and API keys as applicable).

4. Generate Prisma client and run database migrations

   ```sh
   pnpm prisma migrate dev
   ```

5. Run the app

   ```sh
   pnpm dev
   ```

#### Documents API (FastAPI)

1. Change directory to `documents-api`

   ```sh
   cd documents-api
   ```

2. Install Python dependencies

   ```sh
   poetry install
   ```

3. Configure environment variables

   Create an `.env` file with at least:

   - `GOOGLE_API_KEY`
   - `PORT` (default: 9219)
   - `APP_URL` (default: http://localhost:3000)

4. Start the API (development)

   ```sh
   poetry run python server.py
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

- Start the Documents API, then launch the App.
- Upload documents via the UI; embeddings and classification are handled by the API.
- Use global chat or document-specific chat to query content.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Roadmap

- [x] Global AI chat
- [x] Document-specific AI chat
- [x] Document parsing and embedding generation
- [ ] Improved UI/UX
- [ ] Multi-language support

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

For questions or support, please open an issue or contact the project maintainers.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Acknowledgments

- [Next.js](https://nextjs.org/)
- [React.js](https://reactjs.org/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Poetry](https://python-poetry.org/)
- [OpenAI](https://www.openai.com/)
- [Node.js](https://nodejs.org/en)

<p align="right">(<a href="#readme-top">back to top</a>)</p>
