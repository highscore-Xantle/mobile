DELETE FROM public.posts WHERE game_type IN ('number-duel', 'pixel-rush') AND result_text LIKE '%Number Duel%' OR result_text LIKE '%Pixel Rush%';
