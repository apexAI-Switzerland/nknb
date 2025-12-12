# Naturkostbar Ingredient Management System

![CI](https://github.com/YOUR_USERNAME/nknb/actions/workflows/ci.yml/badge.svg)

A centralized system for managing ingredients, products, and recipes for Naturkostbar.

## Features

- Centralized ingredient and product management
- User-friendly ingredient entry
- Automated nutrient and ingredient calculation
- Ingredient list generation
- Data input via forms
- Export options for nutritional and ingredient breakdowns

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- ShadcnUI
- Supabase
- React Hook Form
- Zod

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Then update the values in `.env.local` with your Supabase credentials.

4. Run the development server:
   ```bash
   npm run dev
   ```

## Project Structure

- `src/app/` - Next.js app router pages
- `src/components/` - Reusable UI components
- `src/lib/` - Utility functions and configurations
- `public/` - Static assets

## Database Schema

The system uses the following tables in Supabase:

- `ingredients` - Raw materials and semi-finished products
- `products` - Final products
- `recipes` - Recipe definitions
- `product_ingredients` - Many-to-many relationship between products and ingredients
- `recipe_ingredients` - Many-to-many relationship between recipes and ingredients

## Development

### Available Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run lint       # Run ESLint
npm run type-check # Run TypeScript type checking
npm run test:ci    # Run all CI checks locally
```

### Pre-commit Checks

Before committing, run the CI checks locally:

```bash
npm run test:ci
```

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration. On every pull request and push to main:

- **Lint**: ESLint checks for code quality
- **Type Check**: TypeScript validation
- **Build**: Ensures the application compiles successfully
- **Security Audit**: Scans for vulnerable dependencies and dangerous code patterns

## Contributing

1. Create a new branch for your feature
2. Make your changes
3. Ensure CI checks pass: `npm run test:ci`
4. Submit a pull request

## License

This project is licensed under the MIT License.
