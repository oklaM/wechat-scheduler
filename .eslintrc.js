module.exports = {
    env: {
        node: true,
        es2021: true,
        browser: true
    },
    extends: ['eslint:recommended', 'prettier'],
    parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module'
    },
    plugins: ['prettier'],
    rules: {
        'prettier/prettier': 'error',
        'linebreak-style': ['error', 'unix'],
        quotes: ['error', 'single'],
        semi: ['error', 'always'],
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'no-console': 'warn',
        'prefer-const': 'error',
        'no-var': 'error',
        eqeqeq: ['error', 'always'],
        curly: ['error', 'all'],
        'brace-style': ['error', '1tbs', { allowSingleLine: true }],
        'space-before-function-paren': [
            'error',
            {
                anonymous: 'never',
                named: 'never',
                asyncArrow: 'always'
            }
        ],
        'keyword-spacing': 'error',
        'space-before-blocks': 'error',
        'object-curly-spacing': ['error', 'always'],
        'array-bracket-spacing': ['error', 'never'],
        'comma-dangle': ['error', 'never'],
        'no-trailing-spaces': 'error',
        'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
        'max-len': [
            'warn',
            {
                code: 120,
                ignoreStrings: true,
                ignoreTemplateLiterals: true,
                ignoreComments: true
            }
        ]
    },
    ignorePatterns: ['node_modules/', 'dist/', 'build/', 'logs/', 'coverage/', '*.min.js']
};
