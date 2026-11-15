BEGIN;
CREATE OR REPLACE FUNCTION check_buyer_budget(buyer_id UUID, cart_total_minor INTEGER)
RETURNS TABLE (is_over BOOLEAN, message TEXT, allowed BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_overrides BOOLEAN;
  v_hard_stop BOOLEAN;
  v_overall   INTEGER;
  v_monthly   INTEGER;
  v_session   INTEGER;
  v_today     DATE := CURRENT_DATE;
BEGIN
  SELECT COALESCE(COUNT(*) > 0, FALSE), COALESCE(bool_or(is_hard_stop), FALSE)
  INTO v_overrides, v_hard_stop
  FROM budget_settings
  WHERE profile_id = buyer_id;

  IF NOT v_overrides THEN
    RETURN QUERY SELECT FALSE, 'No budget set; checkout allowed'::text, TRUE::boolean;
    RETURN;
  END IF;

  SELECT spent_minor INTO v_overall
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'overall'
    AND period_start = '1970-01-01'::DATE;

  v_overall := COALESCE(v_overall, 0);

  SELECT spent_minor INTO v_monthly
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'monthly'
    AND period_start = date_trunc('month', now())::DATE;

  v_monthly := COALESCE(v_monthly, 0);

  SELECT spent_minor INTO v_session
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'session'
    AND period_start = v_today;

  v_session := COALESCE(v_session, 0);

  -- Check each applicable budget
  IF cart_total_minor + v_overall > (
       SELECT amount_minor FROM budget_settings
       WHERE profile_id = buyer_id AND budget_type = 'overall'
       LIMIT 1
     ) THEN
    IF v_hard_stop THEN
      RETURN QUERY SELECT TRUE, format('Cart (%, minor) exceeds overall budget', cart_total_minor), FALSE;
    ELSE
      RETURN QUERY SELECT TRUE, format('Cart exceeds overall budget; override allowed'), TRUE;
    END IF;
    RETURN;
  END IF;

  IF cart_total_minor + v_monthly > (
       SELECT amount_minor FROM budget_settings
       WHERE profile_id = buyer_id AND budget_type = 'monthly'
       LIMIT 1
     ) THEN
    IF v_hard_stop THEN
      RETURN QUERY SELECT TRUE, 'Cart exceeds monthly budget; blocked'::text, FALSE;
    ELSE
      RETURN QUERY SELECT TRUE, 'Cart exceeds monthly budget; override allowed'::text, TRUE;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, 'Within budget'::text, TRUE::boolean;
END;
$$;
COMMIT;
