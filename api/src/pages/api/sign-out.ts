import type { APIRoute } from 'astro';
import { auth } from '../../lib/auth';

/**
 * Custom sign-out endpoint that wraps Better Auth sign-out
 * POST /api/sign-out
 */

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // Read and parse the request body (even if empty)
    let body = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      // Body parsing failed, continue with empty body
    }

    // Call Better Auth sign-out
    await auth.api.signOut({
      headers: request.headers,
      body: body as any,
    });

    // Clear all cookies
    const cookieNames = ['better-auth.session_token', 'better-auth.session', 'session'];
    cookieNames.forEach(name => {
      cookies.delete(name, { path: '/' });
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Signed out successfully'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Sign out error:', error);
    
    // Even if there's an error, try to clear cookies
    const cookieNames = ['better-auth.session_token', 'better-auth.session', 'session'];
    cookieNames.forEach(name => {
      cookies.delete(name, { path: '/' });
    });
    
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Signed out (with errors)'
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
